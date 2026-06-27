"""LLM 9 变体 prompt 生成器。

读取 image_studio_director_board.md 模板，填充用户输入变量，
调用 LLM with_structured_output 生成 9 个风格变体的英文生图 prompt。

注意：.md 模板含 {image_type}/{subject}/{style_preference} 占位符与 JSON {} 示例，
不能用 str.format（会与 JSON 大括号冲突），改用 str.replace 逐个替换占位符。
不能用 config.get_system_prompt（会转义所有大括号破坏 JSON 示例），
直接读取 .md 原文。
"""

from __future__ import annotations

import logging

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import PROJECT_ROOT
from src.image_studio.models import DirectorBoardOutput
from src.nodes.llm import get_llm

logger = logging.getLogger(__name__)

_PROMPT_PATH = PROJECT_ROOT / "src" / "prompts" / "image_studio_director_board.md"

# 9 个维度的标准英文键名，用于校验 LLM 输出
_EXPECTED_DIMENSIONS = (
    "lighting",
    "perspective",
    "scene",
    "color_tone",
    "composition",
    "mood",
    "material",
    "lens",
    "art_style",
)


def _load_prompt_template() -> str:
    """读取 .md prompt 原文（不转义大括号）。"""
    if not _PROMPT_PATH.exists():
        raise FileNotFoundError(f"找不到 prompt 文件: {_PROMPT_PATH}")
    return _PROMPT_PATH.read_text(encoding="utf-8")


def _fill_template(template: str, image_type: str, subject: str, style_preference: str | None) -> str:
    """用 str.replace 填充 3 个占位符，避免与 JSON {} 冲突。"""
    filled = template.replace("{image_type}", image_type)
    filled = filled.replace("{subject}", subject)
    filled = filled.replace(
        "{style_preference}", style_preference or "（用户未指定风格偏好，请按各维度默认方向自由发挥）"
    )
    return filled


def _validate_output(output: DirectorBoardOutput) -> None:
    """校验 LLM 输出：变体数为 9，维度键名正确，variant_id 1-9。"""
    if len(output.variants) != 9:
        raise ValueError(
            f"LLM 返回的变体数不是 9，实际: {len(output.variants)}"
        )
    actual_dims = [v.dimension for v in output.variants]
    if tuple(actual_dims) != _EXPECTED_DIMENSIONS:
        raise ValueError(
            f"维度顺序不匹配，期望: {_EXPECTED_DIMENSIONS}，实际: {tuple(actual_dims)}"
        )
    actual_ids = [v.variant_id for v in output.variants]
    if sorted(actual_ids) != list(range(1, 10)):
        raise ValueError(f"variant_id 应为 1-9，实际: {actual_ids}")


def build_variant_prompts(
    image_type: str,
    subject: str,
    style_preference: str | None,
) -> DirectorBoardOutput:
    """调用 LLM 生成 9 个风格变体的英文生图 prompt。

    Args:
        image_type: 参考图类型 "person" 或 "product"
        subject: 创作主题
        style_preference: 可选风格偏好

    Returns:
        DirectorBoardOutput: 含 consistency_key 与 9 个变体的结构化输出

    Raises:
        RuntimeError: LLM 调用或校验失败
    """
    logger.info(
        "[ImageStudio] 生成 9 变体 prompt: image_type=%s, subject=%s", image_type, subject
    )

    try:
        template = _load_prompt_template()
        system_prompt = _fill_template(template, image_type, subject, style_preference)

        llm = get_llm(temperature=0.8)
        structured_llm = llm.with_structured_output(DirectorBoardOutput)
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", system_prompt),
                ("human", "请严格按 9 个维度顺序生成 9 个风格变体，输出纯 JSON。"),
            ]
        )
        chain = prompt | structured_llm
        result: DirectorBoardOutput = chain.invoke({})

        _validate_output(result)
        logger.info(
            "[ImageStudio] 9 变体 prompt 生成成功，consistency_key=%s",
            result.consistency_key[:80],
        )
        return result

    except ValidationError as e:
        logger.exception("[ImageStudio] LLM 输出校验失败")
        raise RuntimeError(f"LLM 输出不符合模型 schema: {e}") from e
    except Exception as e:
        logger.exception("[ImageStudio] 生成 9 变体 prompt 失败")
        raise RuntimeError(f"生成 9 变体 prompt 失败: {e}") from e
