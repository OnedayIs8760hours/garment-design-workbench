from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from agent_app.core.errors import (
    AssetStorageError,
    MemoryCapacityExceeded,
    ProviderError,
    QuotaUnavailable,
)


async def provider_error(request: Request, error: ProviderError):
    return JSONResponse(status_code=502, content={"detail": "模型服务暂不可用，请稍后重试"})


async def storage_error(request: Request, error: AssetStorageError):
    return JSONResponse(status_code=502, content={"detail": "图片保存失败，请检查存储服务后重试"})


async def quota_error(request: Request, error: QuotaUnavailable):
    return JSONResponse(status_code=503, content={"detail": "额度服务暂不可用，请稍后重试"})


async def memory_error(request: Request, error: MemoryCapacityExceeded):
    return JSONResponse(status_code=503, content={"detail": "会话服务繁忙，请稍后重试"})


def register_exception_handlers(app: FastAPI):
    app.add_exception_handler(ProviderError, provider_error)
    app.add_exception_handler(AssetStorageError, storage_error)
    app.add_exception_handler(QuotaUnavailable, quota_error)
    app.add_exception_handler(MemoryCapacityExceeded, memory_error)
