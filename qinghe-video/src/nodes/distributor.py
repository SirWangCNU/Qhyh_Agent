"""投放 Agent 节点。

根据目标平台特性，优化视频发布方案。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import get_system_prompt
from src.models import DistributorOutput
from src.nodes.llm import get_llm
from src.utils.json_parser import invoke_structured_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("distributor")


def distributor_node(state: dict[str, Any]) -> dict[str, Any]:
    """投放节点：生成平台规格、标题、标签、发布时间建议。

    Args:
        state: 全局共享状态。

    Returns:
        dict: 更新后的状态片段。
    """
    logger.info("[Distributor] 开始生成投放方案，平台=%s", state.get("target_platform"))
    try:
        llm = get_llm(temperature=0.7)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请为以下视频制定目标平台的投放方案：\n\n"
                    "【产品信息】\n产品：{product_name}，目标平台：{target_platform}，目标时长：{target_duration}\n\n"
                    "【策划方案】\n{planner_output}\n\n"
                    "【口播文案】\n{copywriter_output}\n\n"
                    "【分镜脚本】\n{scriptwriter_output}\n\n"
                    "【视觉方案】\n{visual_output}",
                ),
            ]
        )

        result: DistributorOutput = invoke_structured_llm(
            llm,
            prompt,
            DistributorOutput,
            {
                "product_name": state.get("product_name", ""),
                "target_platform": state.get("target_platform", "抖音"),
                "target_duration": state.get("target_duration", "30-60秒"),
                "planner_output": json.dumps(state.get("planner_output", {}), ensure_ascii=False, indent=2),
                "copywriter_output": json.dumps(state.get("copywriter_output", {}), ensure_ascii=False, indent=2),
                "scriptwriter_output": json.dumps(state.get("scriptwriter_output", {}), ensure_ascii=False, indent=2),
                "visual_output": json.dumps(state.get("visual_output", {}), ensure_ascii=False, indent=2),
            },
        )

        logger.info("[Distributor] 投放方案生成完成，标题=%s", result.publish_content.title)
        return {"distributor_output": result.model_dump()}
    except ValidationError as e:
        logger.exception("[Distributor] 输出校验失败")
        return {"error": f"投放 Agent 输出格式错误: {e}"}
    except Exception as e:
        logger.exception("[Distributor] 节点执行失败")
        return {"error": f"投放 Agent 执行失败: {e}"}
