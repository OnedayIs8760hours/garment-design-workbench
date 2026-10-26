from langchain_openai import ChatOpenAI

from agent_app.core.config import Settings


def create_chat_model(settings: Settings) -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.chat_model,
        api_key=settings.chat_api_key.get_secret_value(),
        base_url=str(settings.chat_base_url).rstrip("/"),
        timeout=settings.chat_timeout_seconds,
        max_retries=0,
    )
