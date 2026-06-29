"""基础测试：验证图构建、状态定义、数据模型与节点路由。"""

from __future__ import annotations

import pytest

from src.models import (
    CopywriterOutput,
    DistributorOutput,
    PlannerOutput,
    ScriptwriterOutput,
    ShotPrompt,
    VisualOutput,
)
from src.state import QingheState


def test_state_is_typeddict_compatible():
    """QingheState 应包含所有必要字段。"""
    required = {
        "product_name", "origin", "category", "selling_points",
        "target_platform", "target_duration", "additional_info",
        "planner_output", "copywriter_output", "scriptwriter_output",
        "visual_output", "distributor_output", "final_report", "error",
    }
    # TypedDict 的 __annotations__ 在运行时可访问
    assert required.issubset(set(QingheState.__annotations__.keys()))


def test_planner_output_model_forbids_extra():
    """PlannerOutput 应拒绝多余字段。"""
    with pytest.raises(Exception):
        PlannerOutput(
            theme="t",
            core_selling_points=["a"],
            target_audience={"age_range": "1", "region": "r", "consumer_profile": "c"},
            emotion_tone="e",
            creative_angle="a",
            video_type="原产地溯源",
            strategy_notes=None,
            unexpected_field="x",
        )


def test_planner_output_valid():
    """合法的 PlannerOutput 应能正常构造。"""
    out = PlannerOutput(
        theme="阳山桃的夏天",
        core_selling_points=["汁多味甜", "地理标志"],
        target_audience={
            "age_range": "25-45岁",
            "region": "一二线城市",
            "consumer_profile": "注重健康的白领",
        },
        emotion_tone="温暖治愈",
        creative_angle="从一颗桃子看百年果园",
        video_type="原产地溯源",
        strategy_notes="突出产地",
    )
    assert out.video_type == "原产地溯源"
    assert len(out.core_selling_points) == 2


def test_visual_shot_prompt_normalizes_pitch_id():
    """视觉 Prompt 应兼容 LLM 偶发输出的 pitch_id 字段。"""
    shot = ShotPrompt.model_validate(
        {
            "pitch_id": 5,
            "prompt": "fresh peach orchard in warm morning light, realistic photography",
            "negative_prompt": "low quality, blurry",
            "recommended_tool": "doubao-seedream",
            "aspect_ratio": "9:16",
            "reference_style": "农业纪录片质感",
        }
    )

    assert shot.shot_id == 5
    assert "pitch_id" not in shot.model_dump()


def test_graph_builds_without_error():
    """LangGraph 应能成功编译。"""
    from src.graph import build_graph

    graph = build_graph()
    assert graph is not None


def test_prompt_files_exist():
    """5 个 prompt 文件应可正常读取。"""
    from src.config import get_system_prompt

    for name in ("planner", "copywriter", "scriptwriter", "visual_designer", "distributor"):
        text = get_system_prompt(name)
        assert len(text) > 50, f"prompt {name} 内容过短"
        # 确认 JSON 大括号已被转义为 {{ 和 }}
        assert "{{" in text and "}}" in text, f"prompt {name} 未正确转义大括号"


def test_models_importable():
    """所有输出模型应可正常导入。"""
    assert PlannerOutput is not None
    assert CopywriterOutput is not None
    assert ScriptwriterOutput is not None
    assert VisualOutput is not None
    assert DistributorOutput is not None


def test_visual_designer_injects_consistency_references(monkeypatch):
    """visual_designer 应把 state.consistency_references 注入 prompt 变量。"""
    from src.models import ShotPrompt, VisualOutput, VisualStyle
    from src.nodes import visual_designer as vd

    captured: dict = {}

    def fake_invoke(llm, prompt, model, variables):
        captured["variables"] = variables
        return VisualOutput(
            visual_style=VisualStyle(
                style="cinematic",
                color_palette="warm",
                aspect_ratio="9:16",
                quality_tags="8k",
            ),
            shot_prompts=[
                ShotPrompt(
                    shot_id=1,
                    prompt="a farmer in orchard",
                    negative_prompt="blurry",
                    recommended_tool="doubao-seedream",
                    aspect_ratio="9:16",
                    reference_style="纪录片",
                )
            ],
            consistency_guide="保持人物一致",
        )

    monkeypatch.setattr(vd, "invoke_structured_llm", fake_invoke)
    monkeypatch.setattr(vd, "get_llm", lambda **kw: object())

    state = {
        "scriptwriter_output": {"shots": []},
        "target_platform": "抖音",
        "consistency_references": {
            "character": "30岁果农",
            "object": "阳山水蜜桃",
            "scene": "清晨苹果园",
        },
    }
    result = vd.visual_designer_node(state)

    # 不应返回 error
    assert "error" not in result
    # consistency_section 应包含三类主体描述
    section = captured["variables"]["consistency_section"]
    assert "30岁果农" in section
    assert "阳山水蜜桃" in section
    assert "清晨苹果园" in section
    assert "【一致性参考】" in section


def test_visual_designer_without_consistency_references_is_backward_compatible(monkeypatch):
    """无 consistency_references 时（完整流水线），section 应为空，不报错。"""
    from src.models import ShotPrompt, VisualOutput, VisualStyle
    from src.nodes import visual_designer as vd

    captured: dict = {}

    def fake_invoke(llm, prompt, model, variables):
        captured["variables"] = variables
        return VisualOutput(
            visual_style=VisualStyle(
                style="x", color_palette="x", aspect_ratio="9:16", quality_tags="x"
            ),
            shot_prompts=[
                ShotPrompt(
                    shot_id=1,
                    prompt="p",
                    negative_prompt="n",
                    recommended_tool="t",
                    aspect_ratio="9:16",
                    reference_style="s",
                )
            ],
            consistency_guide="g",
        )

    monkeypatch.setattr(vd, "invoke_structured_llm", fake_invoke)
    monkeypatch.setattr(vd, "get_llm", lambda **kw: object())

    # 完整流水线 state 无 consistency_references 字段
    state = {"scriptwriter_output": {"shots": []}, "target_platform": "抖音"}
    result = vd.visual_designer_node(state)

    assert "error" not in result
    assert captured["variables"]["consistency_section"] == ""


def test_consistency_images_prompt_templates_have_required_sections():
    """3 个一致性生图模板应含主体锁定/排列顺序/负向提示词/质量自检段落。"""
    from src.config import PROJECT_ROOT

    for image_type in ("character", "object", "scene"):
        path = PROJECT_ROOT / "src" / "prompts" / f"consistency_images_{image_type}.md"
        text = path.read_text(encoding="utf-8")
        assert "{subject}" in text, f"{image_type} 模板缺少 {{subject}} 占位符"
        assert "{style_preference}" in text, f"{image_type} 模板缺少 {{style_preference}} 占位符"
        assert "主体锁定" in text, f"{image_type} 模板缺少主体锁定段落"
        assert "排列顺序" in text, f"{image_type} 模板缺少排列顺序段落"
        assert "负向提示词" in text, f"{image_type} 模板缺少负向提示词段落"
        assert "质量自检" in text, f"{image_type} 模板缺少质量自检清单"
