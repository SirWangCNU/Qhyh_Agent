"""LLM 实例工厂。

统一创建 ChatOpenAI 实例，从 .env 读取模型配置，
支持 OpenAI / DeepSeek / Qwen 等兼容接口。
"""

from __future__ import annotations

import logging

from langchain_openai import ChatOpenAI

from src.config import settings

logger = logging.getLogger(__name__)


def get_llm(temperature: float | None = None, **kwargs) -> ChatOpenAI:
    """创建一个 ChatOpenAI 实例。

    Args:
        temperature: 采样温度，默认取 settings.LLM_TEMPERATURE。
        **kwargs: 透传给 ChatOpenAI 的其他参数。

    Returns:
        ChatOpenAI: 配置好的 LLM 实例。
    """
    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
        temperature=temperature if temperature is not None else settings.LLM_TEMPERATURE,
        max_tokens=settings.LLM_MAX_TOKENS,
        **kwargs,
    )
    logger.debug("已创建 LLM 实例: model=%s, base_url=%s", settings.LLM_MODEL, settings.LLM_BASE_URL)
    return llm
