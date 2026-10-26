from langchain.tools import ToolRuntime, tool

from agent_app.services.image_generation import ImageGenerationService
from agent_app.workflows.state import RunContext


def create_image_tool(service: ImageGenerationService):
    @tool
    async def generate_image(prompt: str, runtime: ToolRuntime[RunContext]) -> str:
        """根据完整提示词生成一张图片，每次调用消耗当前登录用户一次每日额度。"""
        return await service.generate(prompt, runtime.context)

    return generate_image
