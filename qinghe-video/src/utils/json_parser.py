"""LLM JSON 输出解析工具。

提供对大型语言模型生成的、可能不合法的 JSON 进行清洗、修复与校验的能力。
包含健壮的结构化输出调用链，优先使用 LangChain with_structured_output，
失败时回退到原始文本输出 + json_repair 修复解析。
"""

from __future__ import annotations

import json
import logging
from typing import Any, Type, TypeVar

from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, ValidationError

try:
    import json_repair  # type: ignore

    HAS_JSON_REPAIR = True
except ImportError:
    HAS_JSON_REPAIR = False

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _strip_markdown_code_blocks(text: str) -> str:
    """去除 LLM 输出中常见的 markdown 代码块标记。"""
    text = text.strip()
    if not text.startswith("```"):
        return text

    lines = text.splitlines()
    # 去除首行的 ``` 与可能的语言标识
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    # 去除尾行的 ```
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def parse_llm_json(raw: str, model_class: Type[T]) -> T:
    """解析 LLM 返回的原始文本为指定的 Pydantic 模型。

    解析流程：
    1. 去除 markdown 代码块包装；
    2. 使用标准库 ``json.loads`` 解析；
    3. 失败时尝试使用 ``json_repair`` 自动修复；
    4. 最终使用 Pydantic 校验并返回模型实例。

    Args:
        raw: LLM 返回的原始字符串。
        model_class: 目标 Pydantic 模型类。

    Returns:
        T: 校验通过的模型实例。

    Raises:
        ValidationError: 无法解析或校验失败时抛出。
    """
    text = _strip_markdown_code_blocks(raw)

    # 第一次尝试：标准 JSON 解析
    try:
        data = json.loads(text)
        return model_class.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as e:
        logger.warning("[parse_llm_json] 直接解析 JSON 失败，尝试修复: %s", e)

    # 第二次尝试：json_repair 自动修复
    if HAS_JSON_REPAIR:
        try:
            data = json_repair.loads(text)
            return model_class.model_validate(data)
        except Exception as e:
            logger.warning("[parse_llm_json] json_repair 修复失败: %s", e)
            raise ValidationError.from_exception_data(
                title=model_class.__name__,
                line_errors=[
                    {
                        "type": "json_invalid",
                        "loc": (),
                        "msg": f"无法解析为合法 JSON: {e}",
                        "input": raw,
                    }
                ],
            ) from e

    # 没有 json_repair 时回退标准错误
    raise ValidationError.from_exception_data(
        title=model_class.__name__,
        line_errors=[
            {
                "type": "json_invalid",
                "loc": (),
                "msg": "无法解析为合法 JSON（未安装 json_repair）",
                "input": raw,
            }
        ],
    )


def invoke_structured_llm(
    llm: Any,
    prompt: ChatPromptTemplate,
    model_class: Type[T],
    invoke_args: dict[str, Any],
) -> T:
    """健壮地调用 LLM 并将输出解析为指定的 Pydantic 模型。

    直接获取 LLM 原始文本输出，然后使用 ``parse_llm_json``（含 json_repair 修复）解析，
    能够容错 LLM 输出中常见的 JSON 格式问题（未转义引号、缺少逗号、中文标点等）。
    若模型支持 ``response_format=json_object`` 则自动启用。

    Args:
        llm: 已配置好 temperature 等参数的 ChatOpenAI 实例或兼容 LangChain chat model。
        prompt: ChatPromptTemplate 实例（system prompt 中应包含明确的 JSON 格式要求）。
        model_class: 目标 Pydantic 模型类。
        invoke_args: 传入 prompt 的变量字典。

    Returns:
        T: 校验通过的模型实例。

    Raises:
        ValidationError: 解析或校验失败时抛出。
    """
    json_llm = llm
    try:
        json_llm = llm.bind(response_format={"type": "json_object"})
    except Exception:
        logger.debug("[invoke_structured_llm] 模型不支持 response_format=json_object，使用默认模式")

    chain = prompt | json_llm
    message: AIMessage = chain.invoke(invoke_args)
    raw_text = message.content if isinstance(message.content, str) else str(message.content)

    logger.debug("[invoke_structured_llm] LLM 原始输出前500字符: %s", raw_text[:500])
    return parse_llm_json(raw_text, model_class)
