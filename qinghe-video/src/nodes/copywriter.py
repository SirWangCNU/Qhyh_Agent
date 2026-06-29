"""文案 Agent 节点。

根据策划 Agent 输出撰写口播文案（含 hook、正文、CTA）。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import get_system_prompt
from src.models import CopywriterOutput
from src.nodes.llm import get_llm
from src.utils.json_parser import invoke_structured_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("copywriter")


def copywriter_node(state: dict[str, Any]) -> dict[str, Any]:
    """文案节点：生成 hook、正文、CTA 与完整口播文案。

    Args:
        state: 全局共享状态，须包含 `planner_output`，可选包含 `selected_topic`。

    Returns:
        dict: 更新后的状态片段，包含 `copywriter_output` 或 `error`。
    """
    logger.info("[Copywriter] 开始撰写口播文案")
    try:
        planner_output = state.get("planner_output")
        if not planner_output:
            return {"error": "文案 Agent 缺少策划方案输入"}

        selected_topic = state.get("selected_topic")
        llm = get_llm(temperature=0.8)

        human_parts = [
            "用户原始输入：\n"
            "产品名称：{product_name}\n产地：{origin}\n品类：{category}\n"
            "卖点：{selling_points}\n目标平台：{target_platform}\n目标时长：{target_duration}\n\n"
            "策划 Agent 输出（JSON）：\n{planner_output}"
        ]

        invoke_vars: dict[str, Any] = {
            "product_name": state.get("product_name", ""),
            "origin": state.get("origin", ""),
            "category": state.get("category", ""),
            "selling_points": state.get("selling_points", ""),
            "target_platform": state.get("target_platform", "抖音"),
            "target_duration": state.get("target_duration", "30-60秒"),
            "planner_output": json.dumps(planner_output, ensure_ascii=False, indent=2),
        }

        if selected_topic:
            human_parts.append(
                "\n\n【重要】这是用户从AI爆款选题中选定的主题方向，你撰写的文案必须严格围绕这个主题，"
                "与策划方案中确定的主题、创意角度、情绪基调保持高度一致，不得偏离：\n{selected_topic_info}"
            )
            invoke_vars["selected_topic_info"] = (
                f"选定主题：{selected_topic.get('theme', '')}\n"
                f"创意角度：{selected_topic.get('creative_angle', '')}\n"
                f"用户痛点/共鸣点：{selected_topic.get('pain_point', '')}\n"
                f"目标受众：{selected_topic.get('target_audience', '')}\n"
                f"开头钩子参考：{selected_topic.get('traffic_hook', '')}"
            )

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                ("human", "\n".join(human_parts)),
            ]
        )

        result: CopywriterOutput = invoke_structured_llm(llm, prompt, CopywriterOutput, invoke_vars)

        logger.info("[Copywriter] 文案撰写完成，字数=%s", result.word_count)
        return {"copywriter_output": result.model_dump()}
    except ValidationError as e:
        logger.exception("[Copywriter] 输出校验失败")
        return {"error": f"文案 Agent 输出格式错误: {e}"}
    except Exception as e:
        logger.exception("[Copywriter] 节点执行失败")
        return {"error": f"文案 Agent 执行失败: {e}"}
