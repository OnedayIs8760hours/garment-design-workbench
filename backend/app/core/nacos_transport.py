"""nacos-sdk-python 2.0.11 的单向 TLS、认证和退出清理适配。"""

import asyncio
import logging
from pathlib import Path

import grpc
from v2.nacos import NacosNamingService
from v2.nacos.common.constants import Constants
from v2.nacos.nacos_client import NacosClient
from v2.nacos.naming.cache.service_info_cache import ServiceInfoCache
from v2.nacos.naming.cache.service_info_updater import ServiceInfoUpdater
from v2.nacos.naming.model.naming_request import NOTIFY_SUBSCRIBER_REQUEST_TYPE
from v2.nacos.naming.remote.naming_grpc_client_proxy import NamingGRPCClientProxy
from v2.nacos.naming.remote.naming_push_request_handler import NamingPushRequestHandler
from v2.nacos.transport.grpc_client import GrpcClient
from v2.nacos.transport.http_agent import HttpAgent


class _AuthHttpAgent(HttpAgent):
    async def request(self, url, method, headers=None, params=None, data=None):
        if url.endswith("/nacos/v1/auth/users/login"):
            # Nacos 3.2 已移除旧 HTTP API；凭据放在表单中，避免网关记录到 request_uri。
            url = url.removesuffix("/v1/auth/users/login") + "/v3/auth/user/login"
            data, params = params, None
            headers = {**(headers or {}), "Content-Type": "application/x-www-form-urlencoded"}
        return await super().request(url, method, headers, params, data)


class _GatewayGrpcClient(GrpcClient):
    async def _create_new_managed_channel(self, server_ip, grpc_port):
        if not self.tls_config.enabled:
            return await super()._create_new_managed_channel(server_ip, grpc_port)

        # 上游固定读取三个证书文件；现有网关只需要服务端认证和系统信任根。
        ca = Path(self.tls_config.ca_file).read_bytes() if self.tls_config.ca_file else None
        credentials = grpc.ssl_channel_credentials(root_certificates=ca)
        channel = grpc.aio.secure_channel(
            f"{server_ip}:{grpc_port}", credentials,
            options=[
                ("grpc.max_receive_message_length", self.grpc_config.max_receive_message_length),
                ("grpc.keepalive_time_ms", self.grpc_config.max_keep_alive_ms),
                ("grpc.use_local_subchannel_pool", 1),
                ("grpc.so_reuseport", 0),
            ],
        )
        try:
            await asyncio.wait_for(channel.channel_ready(), self.grpc_config.grpc_timeout / 1000)
        except BaseException:
            await channel.close()
            raise
        return channel


class _GatewayNamingProxy(NamingGRPCClientProxy):
    async def start(self):
        await self.nacos_server_connector.init()
        self.rpc_client = _GatewayGrpcClient(
            self.logger, str(self.uuid), self.client_config, self.nacos_server_connector,
        )
        self.rpc_client.put_all_labels({
            Constants.LABEL_SOURCE: Constants.LABEL_SOURCE_SDK,
            Constants.LABEL_MODULE: Constants.NAMING_MODULE,
        })
        await self.rpc_client.register_server_request_handler(
            NOTIFY_SUBSCRIBER_REQUEST_TYPE,
            NamingPushRequestHandler(self.logger, self.service_info_cache),
        )
        await self.rpc_client.register_connection_listener(self.redo_service)
        await self.rpc_client.start()


class NamingService(NacosNamingService):
    def __init__(self, client_config):
        tasks_before = asyncio.all_tasks()
        handlers_before = set(logging.getLogger(Constants.NAMING_MODULE).handlers)
        NacosClient.__init__(self, client_config, Constants.NAMING_MODULE)
        self._log_handlers = set(self.logger.handlers) - handlers_before
        self.namespace_id = client_config.namespace_id or Constants.NAMING_DEFAULT_NAMESPACE_ID
        self.http_agent = _AuthHttpAgent(
            self.logger, client_config.tls_config, client_config.timeout_ms / 1000,
        )
        self.service_info_holder = ServiceInfoCache(client_config)
        self.grpc_client_proxy = _GatewayNamingProxy(
            client_config, self.http_agent, self.service_info_holder,
        )
        self.service_info_updater = ServiceInfoUpdater(
            self.service_info_holder, client_config.update_thread_num, self.grpc_client_proxy,
        )
        # 构造期间没有 await；这些任务只属于当前 SDK 实例（缓存、认证、重注册）。
        self._background_tasks = asyncio.all_tasks() - tasks_before

    async def start(self):
        await self.grpc_client_proxy.start()

    async def shutdown(self):
        # 上游 shutdown 会 await 同步 stop，且未取消构造时创建的后台任务。
        self.service_info_updater.stop()
        try:
            for task in self._background_tasks:
                task.cancel()
            await asyncio.gather(*self._background_tasks, return_exceptions=True)
            if self.grpc_client_proxy.rpc_client is not None:
                await self.grpc_client_proxy.close_client()
        finally:
            for handler in self._log_handlers:
                self.logger.removeHandler(handler)
                handler.close()
