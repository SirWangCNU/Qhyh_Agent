"""AI 爆款选题服务。

把用户提供的「产品名 + 一句话创意」发散为多个差异化的爆款主题候选，
供用户在前端选择后，再把选定主题回填为一句话创意、触发润写补全完整 UserInput，
最后进入 planner。

用法示例::

    from src.topic_generation import TopicRequest, generate_topics

    req = TopicRequest(product_name="阳山水蜜桃", one_liner="想拍产地溯源短视频")
    result = generate_topics(req)
    for t in result.topics:
        print(t.theme, "|", t.creative_angle, "|", t.traffic_hook)
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.config import get_system_prompt
from src.nodes.llm import get_llm
from src.utils.json_parser import invoke_structured_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("topic")


class TopicRequest(BaseModel):
    """选题请求：产品名 + 一句话创意。"""

    model_config = ConfigDict(extra="forbid")

    product_name: str
    one_liner: str
    target_platform: str = "抖音"
    count: int = Field(default=6, ge=3, le=10, description="候选主题数量")


class TopicCandidate(BaseModel):
    """单个爆款主题候选。

    字段名与 ``prompts/topic.txt`` 中的 JSON 结构严格对齐。
    """

    model_config = ConfigDict(extra="forbid")

    theme: str = Field(..., description="爆款主题标题（一句话，含钩子）")
    creative_angle: str = Field(..., description="创意角度/切入点")
    pain_point: str = Field(..., description="用户痛点或共鸣点")
    target_audience: str = Field(..., description="预期受众画像")
    traffic_hook: str = Field(..., description="开头3秒钩子")
    appeal_reason: str = Field(..., description="为什么有爆款潜力")


class TopicOutput(BaseModel):
    """选题结果：候选主题列表。"""

    model_config = ConfigDict(extra="forbid")

    topics: list[TopicCandidate] = Field(..., min_length=3, description="候选主题列表")


def generate_topics(req: TopicRequest) -> TopicOutput:
    """调用 LLM 生成多个差异化爆款主题候选。

    Args:
        req: 包含产品名、一句话创意、目标平台与候选数量的请求。

    Returns:
        TopicOutput: 候选主题列表，长度与 ``req.count`` 一致。

    Raises:
        ValidationError: LLM 输出不符合 TopicOutput 结构。
        Exception: LLM 调用失败。
    """
    logger.info(
        "[Topic] 开始选题，产品=%s, 创意=%s, 平台=%s, 数量=%d",
        req.product_name,
        req.one_liner,
        req.target_platform,
        req.count,
    )
    try:
        llm = get_llm(temperature=0.9)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请根据以下信息生成 {count} 个差异化的爆款主题候选：\n"
                    "产品名称：{product_name}\n"
                    "一句话创意：{one_liner}\n"
                    "目标平台：{target_platform}\n"
                    "候选数量：{count}",
                ),
            ]
        )

        result: TopicOutput = invoke_structured_llm(
            llm,
            prompt,
            TopicOutput,
            {
                "product_name": req.product_name,
                "one_liner": req.one_liner,
                "target_platform": req.target_platform,
                "count": req.count,
            },
        )

        logger.info(
            "[Topic] 选题完成，共 %d 个候选，首个主题=%s",
            len(result.topics),
            result.topics[0].theme if result.topics else "(空)",
        )
        return result
    except ValidationError as e:
        logger.exception("[Topic] 输出校验失败")
        raise RuntimeError(f"选题输出格式错误: {e}") from e
    except Exception as e:
        logger.exception("[Topic] 选题失败")
        raise RuntimeError(f"选题失败: {e}") from e
