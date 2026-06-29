"""选题服务单元测试：验证模型校验、prompt 加载与模块可导入性。

不依赖 LLM API key —— 仅验证数据模型与 prompt 文件加载。
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config import get_system_prompt
from src.topic_generation import TopicCandidate, TopicOutput, TopicRequest


# ---------- 模型校验 ----------

def test_topic_request_defaults():
    """TopicRequest 应提供合理默认值。"""
    req = TopicRequest(product_name="阳山水蜜桃", one_liner="想拍产地溯源短视频")
    assert req.target_platform == "抖音"
    assert req.count == 6


def test_topic_request_count_bounds():
    """count 应限制在 [3, 10]。"""
    with pytest.raises(ValidationError):
        TopicRequest(product_name="p", one_liner="c", count=2)
    with pytest.raises(ValidationError):
        TopicRequest(product_name="p", one_liner="c", count=11)
    # 边界值合法
    TopicRequest(product_name="p", one_liner="c", count=3)
    TopicRequest(product_name="p", one_liner="c", count=10)


def test_topic_request_forbids_extra():
    """TopicRequest 应拒绝多余字段。"""
    with pytest.raises(ValidationError):
        TopicRequest(
            product_name="p",
            one_liner="c",
            unexpected_field="x",
        )


def test_topic_candidate_forbids_extra():
    """TopicCandidate 应拒绝多余字段。"""
    with pytest.raises(ValidationError):
        TopicCandidate(
            theme="t",
            creative_angle="a",
            pain_point="p",
            target_audience="ta",
            traffic_hook="h",
            appeal_reason="r",
            unexpected_field="x",
        )


def test_topic_output_min_length():
    """TopicOutput 应要求至少 3 个候选。"""
    TopicOutput(topics=[
        TopicCandidate(theme="t", creative_angle="a", pain_point="p",
                       target_audience="ta", traffic_hook="h", appeal_reason="r"),
    ] * 3)
    with pytest.raises(ValidationError):
        TopicOutput(topics=[
            TopicCandidate(theme="t", creative_angle="a", pain_point="p",
                           target_audience="ta", traffic_hook="h", appeal_reason="r"),
        ] * 2)


def test_topic_output_forbids_extra():
    """TopicOutput 应拒绝多余字段。"""
    with pytest.raises(ValidationError):
        TopicOutput(topics=[], unexpected_field="x")


# ---------- Prompt 加载 ----------

def test_topic_prompt_loaded():
    """topic.txt 应存在且可加载为 system prompt（花括号被转义）。"""
    prompt = get_system_prompt("topic")
    assert isinstance(prompt, str)
    assert len(prompt) > 0
    # JSON 示例中的花括号应被转义为 {{ }}
    assert "{{" in prompt or "topics" in prompt


# ---------- 模块可导入性 ----------

def test_topic_generation_module_importable():
    """topic_generation 模块应可导入（模块级 prompt 加载成功）。"""
    from src import topic_generation
    assert hasattr(topic_generation, "generate_topics")
    assert hasattr(topic_generation, "TopicRequest")
    assert hasattr(topic_generation, "TopicOutput")
