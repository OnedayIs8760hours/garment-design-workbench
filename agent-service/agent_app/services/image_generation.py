from agent_app.core.errors import AssetStorageError, ProviderError
from agent_app.persistence.quota import QuotaStore
from agent_app.providers.assets import GeneratedAssetStorage
from agent_app.providers.images import ImageProvider
from agent_app.workflows.state import RunContext


class ImageGenerationService:
    """Own the generation policy independently of LangChain tool registration."""

    def __init__(self, provider: ImageProvider, quota: QuotaStore, storage: GeneratedAssetStorage):
        self.provider = provider
        self.quota = quota
        self.storage = storage

    async def generate(self, prompt: str, context: RunContext) -> str:
        if context.tool_invoked:
            raise ProviderError("每轮最多调用一次生图工具")
        context.tool_invoked = True
        allowed, context.quota = await self.quota.reserve(context.user_id)
        if not allowed:
            context.status = "quota_exceeded"
            return "今日 5 次生图调用额度已用完，请明天再试。"
        try:
            image = await self.provider.generate(prompt)
        except ProviderError:
            context.status = "generation_failed"
            return "生图服务暂时未能返回图片，本次调用已计入今日额度，请稍后重试。"
        try:
            image = await self.storage.save(image, context.access_token)
        except AssetStorageError:
            context.status = "storage_failed"
            context.images.append(image)
            return "图片已生成，但保存到素材库失败。请点击重新保存，无需再次生图。"
        context.images.append(image)
        return f"已生成 1 张图片并保存到素材库。图像描述：{prompt}"
