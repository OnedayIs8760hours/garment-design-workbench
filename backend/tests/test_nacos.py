import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config.config import Config
from app.core.nacos import NacosRegistry, _server_addresses


@pytest.fixture
def config():
    return SimpleNamespace(
        NACOS_ENABLED=True, NACOS_SERVER_ADDR="middleware.test:18848",
        NACOS_NAMESPACE_ID="design-test", NACOS_SERVICE_NAME="woda-design-backend",
        NACOS_GROUP_NAME="DESIGN", NACOS_CLUSTER_NAME="DEFAULT",
        NACOS_INSTANCE_IP="192.168.10.30", NACOS_INSTANCE_PORT=8080,
        NACOS_USERNAME="design", NACOS_PASSWORD="test-password",
        NACOS_TLS_ENABLED=True, NACOS_TLS_CA_FILE="", NACOS_TIMEOUT_SECONDS=1,
    )


@pytest.fixture
def sdk(monkeypatch):
    client = SimpleNamespace(
        start=AsyncMock(), register_instance=AsyncMock(return_value=True),
        deregister_instance=AsyncMock(return_value=True), shutdown=AsyncMock(),
    )
    configs = []

    def create(client_config):
        configs.append(client_config)
        return client

    monkeypatch.setattr("app.core.nacos_transport.NamingService", create)
    return SimpleNamespace(client=client, configs=configs)


def test_register_and_deregister_same_identity(config, sdk):
    async def scenario():
        registry = NacosRegistry(config)
        await registry.start()
        await registry.start()
        registered = sdk.client.register_instance.call_args.args[0]
        assert (registered.service_name, registered.group_name, registered.cluster_name) == (
            "woda-design-backend", "DESIGN", "DEFAULT",
        )
        assert (registered.ip, registered.port, registered.ephemeral) == ("192.168.10.30", 8080, True)
        assert registered.metadata == {"contextPath": "/api", "healthPath": "/api/health"}
        sdk.client.register_instance.assert_awaited_once()
        client_config = sdk.configs[0]
        assert client_config.server_list == ["https://middleware.test:18848"]
        assert client_config.namespace_id == "design-test"
        assert client_config.tls_config.enabled is True
        assert (client_config.username, client_config.password) == ("design", "test-password")
        assert client_config.log_level == logging.WARNING
        await registry.stop()
        await registry.stop()
        deregistered = sdk.client.deregister_instance.call_args.args[0]
        assert deregistered.model_dump() == registered.model_dump(include=set(type(deregistered).model_fields))
        sdk.client.shutdown.assert_awaited_once()
        assert registry.client is None

    asyncio.run(scenario())


def test_disabled_lifespan_does_not_load_sdk(monkeypatch):
    import builtins

    original_import = builtins.__import__

    def guarded_import(name, *args, **kwargs):
        if name.startswith("v2.nacos") or name == "app.core.nacos_transport":
            pytest.fail("disabled registration must not import the SDK")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(Config, "NACOS_ENABLED", False)
    monkeypatch.setattr(Config, "NACOS_INSTANCE_IP", "")
    monkeypatch.setattr(builtins, "__import__", guarded_import)
    with TestClient(main.app) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        assert main.app.state.nacos_registry.client is None


@pytest.mark.parametrize("changes", [
    {"NACOS_SERVER_ADDR": ""},
    {"NACOS_SERVER_ADDR": "http://middleware.test:18848"},
    {"NACOS_SERVER_ADDR": "https://user:password@middleware.test:18848"},
    {"NACOS_SERVER_ADDR": "middleware.test:65000"},
    {"NACOS_SERVER_ADDR": "middleware.test:18848/nacos"},
    {"NACOS_INSTANCE_IP": ""},
    {"NACOS_INSTANCE_IP": "0.0.0.0"},
    {"NACOS_INSTANCE_IP": "::"},
    {"NACOS_INSTANCE_IP": "224.0.0.1"},
    {"NACOS_INSTANCE_PORT": 0},
    {"NACOS_INSTANCE_PORT": 65536},
    {"NACOS_SERVICE_NAME": ""},
    {"NACOS_GROUP_NAME": ""},
    {"NACOS_CLUSTER_NAME": ""},
    {"NACOS_PASSWORD": ""},
    {"NACOS_TIMEOUT_SECONDS": 0},
    {"NACOS_TIMEOUT_SECONDS": float("nan")},
    {"NACOS_TLS_CA_FILE": "missing-nacos-ca.pem"},
])
def test_invalid_settings_fail_before_connecting(config, sdk, changes):
    config.__dict__.update(changes)
    with pytest.raises(ValueError):
        asyncio.run(NacosRegistry(config).start())
    assert sdk.configs == []


def test_cluster_addresses_and_plaintext_option(config):
    config.NACOS_SERVER_ADDR = " first.test:8848, http://second.test:8848 "
    config.NACOS_TLS_ENABLED = False
    assert _server_addresses(config) == "http://first.test:8848,http://second.test:8848"


@pytest.mark.parametrize("failure", [RuntimeError("unavailable"), False, "timeout", "start"])
def test_failed_registration_closes_client_and_fails_startup(config, sdk, failure):
    async def stall(*args):
        await asyncio.sleep(10)

    if failure == "timeout":
        config.NACOS_TIMEOUT_SECONDS = 0.02
        sdk.client.register_instance.side_effect = stall
    elif failure == "start":
        sdk.client.start.side_effect = RuntimeError("connection refused")
    elif failure is False:
        sdk.client.register_instance.return_value = False
    else:
        sdk.client.register_instance.side_effect = failure

    async def scenario():
        registry = NacosRegistry(config)
        with pytest.raises((RuntimeError, TimeoutError)):
            await registry.start()
        sdk.client.shutdown.assert_awaited_once()
        assert registry.client is None

    asyncio.run(scenario())


def test_shutdown_closes_client_even_when_deregistration_fails(config, sdk, caplog):
    async def scenario():
        registry = NacosRegistry(config)
        await registry.start()
        sdk.client.deregister_instance.side_effect = RuntimeError("secret-must-not-be-logged")
        await registry.stop()
        sdk.client.shutdown.assert_awaited_once()
        assert "secret-must-not-be-logged" not in caplog.text
        assert "RuntimeError" in caplog.text

    asyncio.run(scenario())


def test_lifespan_registers_before_serving_and_deregisters_on_shutdown(monkeypatch):
    registry = SimpleNamespace(start=AsyncMock(), stop=AsyncMock())
    monkeypatch.setattr(main, "NacosRegistry", lambda _config: registry)
    with TestClient(main.app) as client:
        registry.start.assert_awaited_once()
        assert main.app.state.nacos_registry is registry
        assert client.get("/api/health").json()["service"] == "woda-design-backend"
    registry.stop.assert_awaited_once()


def test_lifespan_rejects_failed_registration(monkeypatch):
    registry = SimpleNamespace(start=AsyncMock(side_effect=RuntimeError("unavailable")), stop=AsyncMock())
    monkeypatch.setattr(main, "NacosRegistry", lambda _config: registry)
    with pytest.raises(RuntimeError, match="unavailable"):
        with TestClient(main.app):
            pytest.fail("application must not accept requests")
    registry.stop.assert_awaited_once()
