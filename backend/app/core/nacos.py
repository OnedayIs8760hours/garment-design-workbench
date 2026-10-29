import asyncio
import ipaddress
import logging
import math
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from app.config.config import Config

if TYPE_CHECKING:
    from v2.nacos import RegisterInstanceParam
    from app.core.nacos_transport import NamingService

logger = logging.getLogger(__name__)


def _server_addresses(config: type[Config]) -> str:
    scheme = "https" if config.NACOS_TLS_ENABLED else "http"
    addresses = []
    for address in config.NACOS_SERVER_ADDR.split(","):
        address = address.strip()
        if "://" not in address:
            address = f"{scheme}://{address}"
        parsed = urlsplit(address)
        if (
            parsed.scheme != scheme or not parsed.hostname or not parsed.port
            or parsed.username is not None or parsed.password is not None
            or parsed.path not in {"", "/"} or parsed.query or parsed.fragment
            or ":" in parsed.hostname
        ):
            raise ValueError("NACOS_SERVER_ADDR 必须是与 TLS 开关一致的 host:port 列表")
        if parsed.port > 64535:
            raise ValueError("Nacos gRPC 端口为 HTTP 端口 + 1000，端口超出范围")
        addresses.append(f"{scheme}://{parsed.hostname}:{parsed.port}")
    return ",".join(addresses)


class NacosRegistry:
    def __init__(self, config: type[Config]):
        self.config = config
        self.client: NamingService | None = None
        self._registration: RegisterInstanceParam | None = None

    async def start(self) -> None:
        if not self.config.NACOS_ENABLED:
            return
        if self.client is not None:
            return
        config = self.config
        addresses = _server_addresses(config)
        ip = ipaddress.ip_address(config.NACOS_INSTANCE_IP)
        if ip.is_unspecified or ip.is_multicast:
            raise ValueError("NACOS_INSTANCE_IP 必须是调用方可达的实例 IP")
        if not 1 <= config.NACOS_INSTANCE_PORT <= 65535:
            raise ValueError("NACOS_INSTANCE_PORT 必须填写实际监听端口（1-65535）")
        if not all((config.NACOS_SERVICE_NAME, config.NACOS_GROUP_NAME, config.NACOS_CLUSTER_NAME)):
            raise ValueError("Nacos 服务名、分组和集群不能为空")
        if bool(config.NACOS_USERNAME) != bool(config.NACOS_PASSWORD):
            raise ValueError("NACOS_USERNAME 和 NACOS_PASSWORD 必须同时填写")
        if not math.isfinite(config.NACOS_TIMEOUT_SECONDS) or config.NACOS_TIMEOUT_SECONDS <= 0:
            raise ValueError("NACOS_TIMEOUT_SECONDS 必须大于 0")
        if config.NACOS_TLS_CA_FILE and not Path(config.NACOS_TLS_CA_FILE).is_file():
            raise ValueError("NACOS_TLS_CA_FILE 必须指向可读取的 CA 证书文件")

        from v2.nacos import ClientConfigBuilder, GRPCConfig, RegisterInstanceParam, TLSConfig
        from app.core.nacos_transport import NamingService

        client_config = (
            ClientConfigBuilder()
            .server_address(addresses)
            .namespace_id(config.NACOS_NAMESPACE_ID)
            .username(config.NACOS_USERNAME)
            .password(config.NACOS_PASSWORD)
            # SDK 的 INFO 日志包含 accessToken，保持 WARNING，避免记录凭据。
            .log_level(logging.WARNING)
            .timeout_ms(int(config.NACOS_TIMEOUT_SECONDS * 1000))
            .grpc_config(GRPCConfig(grpc_timeout=int(config.NACOS_TIMEOUT_SECONDS * 1000)))
            .tls_config(TLSConfig(enabled=config.NACOS_TLS_ENABLED, ca_file=config.NACOS_TLS_CA_FILE))
            .load_cache_at_start(False)
            .build()
        )
        self._registration = RegisterInstanceParam(
            service_name=config.NACOS_SERVICE_NAME,
            group_name=config.NACOS_GROUP_NAME,
            cluster_name=config.NACOS_CLUSTER_NAME,
            ip=str(ip), port=config.NACOS_INSTANCE_PORT,
            ephemeral=True,
            metadata={"contextPath": "/api", "healthPath": "/api/health"},
        )
        self.client = NamingService(client_config)
        try:
            async with asyncio.timeout(config.NACOS_TIMEOUT_SECONDS):
                await self.client.start()
                if not await self.client.register_instance(self._registration):
                    raise RuntimeError("Nacos 拒绝注册实例")
        except BaseException:
            await self.stop()
            raise
        logger.info("Nacos 已注册服务 %s，实例 %s:%s", config.NACOS_SERVICE_NAME, ip, config.NACOS_INSTANCE_PORT)

    async def stop(self) -> None:
        client, self.client = self.client, None
        registration, self._registration = self._registration, None
        if client is None:
            return
        try:
            if registration is not None:
                from v2.nacos import DeregisterInstanceParam

                async with asyncio.timeout(self.config.NACOS_TIMEOUT_SECONDS):
                    result = await client.deregister_instance(DeregisterInstanceParam(
                        **registration.model_dump(include={
                            "service_name", "group_name", "cluster_name", "ip", "port", "ephemeral",
                        }),
                    ))
                    if not result:
                        logger.warning("Nacos 注销未成功，将通过临时实例连接失效清理")
        except Exception as exc:
            logger.warning("Nacos 注销失败（%s），将通过临时实例连接失效清理", type(exc).__name__)
        finally:
            try:
                async with asyncio.timeout(self.config.NACOS_TIMEOUT_SECONDS):
                    await client.shutdown()
            except Exception as exc:
                logger.warning("Nacos 连接关闭失败（%s）", type(exc).__name__)
