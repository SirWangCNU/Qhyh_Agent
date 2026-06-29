"""画布模型选择相关单元测试。

覆盖 src/config.get_image_model_options 的解析逻辑：
- 未配置 IMAGE_MODEL_OPTIONS 时回退为 [IMAGE_MODEL]
- 配置逗号分隔列表时去重并保留顺序
- 始终包含 IMAGE_MODEL
"""
from __future__ import annotations

from src.config import Settings, get_image_model_options


def test_options_fallback_to_image_model(monkeypatch):
    """IMAGE_MODEL_OPTIONS 为空时回退为 [IMAGE_MODEL]。"""
    s = Settings(IMAGE_MODEL="doubao-seedream-5-0-260128", IMAGE_MODEL_OPTIONS="")
    monkeypatch.setattr("src.config.settings", s)
    assert get_image_model_options() == ["doubao-seedream-5-0-260128"]


def test_options_parse_and_dedupe(monkeypatch):
    """逗号分隔列表去重并保留顺序。"""
    s = Settings(
        IMAGE_MODEL="doubao-seedream-5-0-260128",
        IMAGE_MODEL_OPTIONS="model-a, model-b ,model-a, model-c",
    )
    monkeypatch.setattr("src.config.settings", s)
    # IMAGE_MODEL 未在列表中，插到最前
    assert get_image_model_options() == [
        "doubao-seedream-5-0-260128",
        "model-a",
        "model-b",
        "model-c",
    ]


def test_options_keep_image_model_when_present(monkeypatch):
    """IMAGE_MODEL 已在列表中时不重复插入。"""
    s = Settings(
        IMAGE_MODEL="doubao-seedream-5-0-260128",
        IMAGE_MODEL_OPTIONS="doubao-seedream-5-0-260128,model-b",
    )
    monkeypatch.setattr("src.config.settings", s)
    assert get_image_model_options() == ["doubao-seedream-5-0-260128", "model-b"]
