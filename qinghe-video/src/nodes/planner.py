"""策划 Agent 节点。

根据用户输入的农产品信息，制定视频创作策略。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import get_system_prompt
from src.models import PlannerOutput
from src.nodes.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("planner")


def planner_node(state: dict[str, Any]) -> dict[str, Any]:
    """策划节点：提炼卖点、确定受众与主题方向。

    Args:
        state: 全局共享状态。

    Returns:
        dict: 更新后的状态片段，包含 `planner_output` 或 `error`。
    """
    logger.info("[Planner] 开始生成策划方案，产品=%s", state.get("product_name"))
    try:
        llm = get_llm(temperature=0.7)
        structured_llm = llm.with_structured_output(PlannerOutput)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请为以下农产品制定短视频创作策略：\n"
                    "产品名称：{product_name}\n"
                    "产地：{origin}\n"
                    "品类：{category}\n"
                    "卖点：{selling_points}\n"
                    "目标平台：{target_platform}\n"
                    "目标时长：{target_duration}\n"
                    "补充信息：{additional_info}",
                ),
            ]
        )

        chain = prompt | structured_llm
        result: PlannerOutput = chain.invoke(
            {
                "product_name": state.get("product_name", ""),
                "origin": state.get("origin", ""),
                "category": state.get("category", ""),
                "selling_points": state.get("selling_points", ""),
                "target_platform": state.get("target_platform", "抖音"),
                "target_duration": state.get("target_duration", "30-60秒"),
                "additional_info": state.get("additional_info") or "无",
            }
        )

        logger.info("[Planner] 策划方案生成完成，主题=%s", result.theme)
        return {"planner_output": result.model_dump()}
    except ValidationError as e:
        logger.exception("[Planner] 输出校验失败")
        return {"error": f"策划 Agent 输出格式错误: {e}"}
    except Exception as e:
        logger.exception("[Planner] 节点执行失败")
        return {"error": f"策划 Agent 执行失败: {e}"}


# 便于调试：打印结构化输入
def _debug_input(state: dict[str, Any]) -> str:
    """调试用：将状态转为紧凑 JSON。"""
    return json.dumps({k: state.get(k) for k in ("product_name", "origin", "category")}, ensure_ascii=False)
