import asyncio
import ipaddress
import json
import logging
import ssl
from datetime import datetime, timedelta, timezone

import grpc
import pytest
from aiohttp import web
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from v2.nacos import ClientConfigBuilder, GRPCConfig, TLSConfig
from v2.nacos.naming.model.naming_response import InstanceResponse
from v2.nacos.transport.grpc_util import GrpcUtils
from v2.nacos.transport.grpcauto import nacos_grpc_service_pb2_grpc as rpc
from v2.nacos.transport.http_agent import HttpAgent
from v2.nacos.transport.model.internal_response import HealthCheckResponse, ServerCheckResponse

from types import SimpleNamespace
from app.core.nacos import NacosRegistry
from app.core.nacos_transport import NamingService, _AuthHttpAgent, _GatewayGrpcClient


@pytest.fixture
def certificate(tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "nacos-local-test")])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
        .sign(key, hashes.SHA256())
    )
    cert_bytes = cert.public_bytes(serialization.Encoding.PEM)
    key_bytes = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    cert_path, key_path = tmp_path / "ca.pem", tmp_path / "server.key"
    cert_path.write_bytes(cert_bytes)
    key_path.write_bytes(key_bytes)
    return cert_path, key_path, cert_bytes, key_bytes


class NamingServer(rpc.RequestServicer, rpc.BiRequestStreamServicer):
    def __init__(self):
        self.requests = []
        self.headers = []

    async def request(self, payload, context):
        kind = payload.metadata.type
        body = json.loads(payload.body.value)
        self.requests.append((kind, body))
        self.headers.append(dict(payload.metadata.headers))
        if kind == "ServerCheckRequest":
            response = ServerCheckResponse(connectionId="local-test")
        elif kind == "HealthCheckRequest":
            response = HealthCheckResponse()
        elif kind == "InstanceRequest":
            response = InstanceResponse()
        else:
            raise AssertionError(kind)
        return GrpcUtils.convert_response_to_payload(response)

    async def requestBiStream(self, requests, context):
        async for payload in requests:
            self.requests.append((payload.metadata.type, json.loads(payload.body.value)))
            if False:
                yield payload


@pytest.mark.parametrize("tls", [True, False])
@pytest.mark.parametrize("authenticated", [True, False])
def test_real_sdk_registration_and_cleanup_over_grpc(certificate, tmp_path, monkeypatch, tls, authenticated):
    cert_path, _, cert_bytes, key_bytes = certificate
    clients = []

    def create(config):
        config.set_log_dir(str(tmp_path / "logs")).set_cache_dir(str(tmp_path / "cache"))
        client = NamingService(config)
        clients.append(client)
        return client

    monkeypatch.setattr("app.core.nacos_transport.NamingService", create)
    logins = []

    async def login(self, url, method, headers=None, params=None, data=None):
        logins.append((url, params, data))
        return b'{"accessToken":"private-test-token","tokenTtl":60}', None

    monkeypatch.setattr(HttpAgent, "request", login)

    async def scenario():
        server = grpc.aio.server()
        naming = NamingServer()
        rpc.add_RequestServicer_to_server(naming, server)
        rpc.add_BiRequestStreamServicer_to_server(naming, server)
        if tls:
            port = server.add_secure_port("127.0.0.1:0", grpc.ssl_server_credentials([(key_bytes, cert_bytes)]))
        else:
            port = server.add_insecure_port("127.0.0.1:0")
        await server.start()
        config = SimpleNamespace(
            NACOS_ENABLED=True, NACOS_SERVER_ADDR=f"127.0.0.1:{port - 1000}",
            NACOS_NAMESPACE_ID="local-test", NACOS_SERVICE_NAME="woda-design-backend",
            NACOS_GROUP_NAME="ERP", NACOS_CLUSTER_NAME="DEFAULT",
            NACOS_INSTANCE_IP="192.168.10.30", NACOS_INSTANCE_PORT=8080,
            NACOS_USERNAME="erp" if authenticated else "",
            NACOS_PASSWORD="private-password" if authenticated else "", NACOS_TLS_ENABLED=tls,
            NACOS_TLS_CA_FILE=str(cert_path) if tls else "", NACOS_TIMEOUT_SECONDS=3,
        )
        registry = NacosRegistry(config)
        try:
            await registry.start()
            await registry.stop()
            operations = [body for kind, body in naming.requests if kind == "InstanceRequest"]
            assert [body["type"] for body in operations] == ["registerInstance", "deregisterInstance"]
            assert operations[0]["instance"]["ip"] == operations[1]["instance"]["ip"] == "192.168.10.30"
            assert operations[0]["instance"]["port"] == operations[1]["instance"]["port"] == 8080
            assert operations[0]["instance"]["metadata"] == {"contextPath": "/api", "healthPath": "/api/health"}
            assert all(task.done() for task in clients[0]._background_tasks)
            assert not set(clients[0].logger.handlers) & clients[0]._log_handlers
            if authenticated:
                assert logins
                assert all(url.endswith("/nacos/v3/auth/user/login") and params is None for url, params, _ in logins)
                assert all(data == {"username": "erp", "password": "private-password"} for _, _, data in logins)
                assert any(headers.get("accessToken") == "private-test-token" for headers in naming.headers)
            else:
                assert logins == []
            log_text = (tmp_path / "logs/naming.log").read_text(encoding="utf-8")
            assert "private-test-token" not in log_text
            assert "private-password" not in log_text
        finally:
            await registry.stop()
            await server.stop(0)

    asyncio.run(scenario())


def test_grpc_tls_rejects_untrusted_server(certificate):
    _, _, cert_bytes, key_bytes = certificate

    async def scenario():
        server = grpc.aio.server()
        port = server.add_secure_port("127.0.0.1:0", grpc.ssl_server_credentials([(key_bytes, cert_bytes)]))
        await server.start()
        config = ClientConfigBuilder().tls_config(TLSConfig(enabled=True)).grpc_config(GRPCConfig(grpc_timeout=100)).build()
        client = _GatewayGrpcClient(logging.getLogger("nacos-test"), "test", config, None)
        try:
            with pytest.raises(TimeoutError):
                await client._create_new_managed_channel("127.0.0.1", port)
        finally:
            await client.shutdown()
            await server.stop(0)

    asyncio.run(scenario())


def test_https_login_keeps_credentials_out_of_url(certificate):
    cert_path, key_path, _, _ = certificate

    async def scenario():
        observed = []

        async def login(request):
            observed.append((request.path_qs, dict(await request.post())))
            return web.json_response({"accessToken": "test-token"})

        app = web.Application()
        app.router.add_post("/nacos/v3/auth/user/login", login)
        runner = web.AppRunner(app)
        await runner.setup()
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(cert_path), str(key_path))
        site = web.TCPSite(runner, "127.0.0.1", 0, ssl_context=ctx)
        await site.start()
        port = runner.addresses[0][1]
        agent = _AuthHttpAgent(logging.getLogger("nacos-test"), TLSConfig(enabled=True, ca_file=str(cert_path)), 1)
        try:
            response, error = await agent.request(
                f"https://127.0.0.1:{port}/nacos/v1/auth/users/login", "POST",
                params={"username": "erp", "password": "private-password"},
            )
            assert error is None
            assert json.loads(response)["accessToken"] == "test-token"
            assert observed == [("/nacos/v3/auth/user/login", {"username": "erp", "password": "private-password"})]
        finally:
            await runner.cleanup()

    asyncio.run(scenario())
