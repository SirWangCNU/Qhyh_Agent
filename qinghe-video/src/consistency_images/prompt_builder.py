"""一致性生图 prompt 构造器。

按 image_type 读取对应 .md 模板，用 str.replace 填充 {subject} / {style_preference}。

注意：
- 不用 str.format（模板含 JSON/布局描述的大括号会冲突）
- 不用 config.get_system_prompt（会转义所有大括号破坏布局描述）
- 直接读取 .md 原文
"""

from __future__ import annotations

import logging

from src.config import PROJECT_ROOT

logger = logging.getLogger(__name__)

_PROMPT_DIR = PROJECT_ROOT / "src" / "prompts"

# image_type → 模板文件名
_TEMPLATE_FILES: dict[str, str] = {
    "character": "consistency_images_character.md",
    "object": "consistency_images_object.md",
    "scene": "consistency_images_scene.md",
}


def _load_template(image_type: str) -> str:
    """读取指定类型的 prompt 模板原文。"""
    filename = _TEMPLATE_FILES.get(image_type)
    if not filename:
        raise ValueError(f"未知 image_type: {image_type}，支持 character/object/scene")
    path = _PROMPT_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"找不到 prompt 文件: {path}")
    return path.read_text(encoding="utf-8")


def build_prompt(image_type: str, subject: str, style_preference: str | None) -> str:
    """构造完整 prompt：读取模板 + str.replace 填占位符。

    Args:
        image_type: character / object / scene
        subject: 主体描述（必填）
        style_preference: 风格偏好（可选，为空时填默认提示）

    Returns:
        完整 prompt 字符串
    """
    template = _load_template(image_type)
    filled = template.replace("{subject}", subject.strip())
    style_text = (
        style_preference.strip()
        if style_preference and style_preference.strip()
        else "（用户未指定风格偏好，按默认棚拍/写实风格生成）"
    )
    filled = filled.replace("{style_preference}", style_text)
    return filled
