"""基础测试：验证图构建、状态定义、数据模型与节点路由。"""

from __future__ import annotations

import pytest

from src.models import (
    CopywriterOutput,
    DistributorOutput,
    PlannerOutput,
    ScriptwriterOutput,
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
