"""脚本 Agent 节点。

将口播文案转化为可执行的分镜脚本。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import get_system_prompt
from src.models import ScriptwriterOutput
from src.nodes.llm import get_llm
from src.utils.json_parser import invoke_structured_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("scriptwriter")


def scriptwriter_node(state: dict[str, Any]) -> dict[str, Any]:
    """脚本节点：生成分镜脚本、镜头运动、BGM 建议。

    Args:
        state: 全局共享状态。

    Returns:
        dict: 更新后的状态片段。
    """
    logger.info("[Scriptwriter] 开始生成分镜脚本")
    try:
        planner_output = state.get("planner_output", {})
        copywriter_output = state.get("copywriter_output", {})

        llm = get_llm(temperature=0.7)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请根据以下策划与文案生成分镜脚本。\n\n"
                    "【产品信息】\n"
                    "产品：{product_name}，产地：{origin}，目标平台：{target_platform}，目标时长：{target_duration}\n\n"
                    "【策划方案】\n{planner_output}\n\n"
                    "【口播文案】\n{copywriter_output}",
                ),
            ]
        )

        result: ScriptwriterOutput = invoke_structured_llm(
            llm,
            prompt,
            ScriptwriterOutput,
            {
                "product_name": state.get("product_name", ""),
                "origin": state.get("origin", ""),
                "target_platform": state.get("target_platform", "抖音"),
                "target_duration": state.get("target_duration", "30-60秒"),
                "planner_output": json.dumps(planner_output, ensure_ascii=False, indent=2),
                "copywriter_output": json.dumps(copywriter_output, ensure_ascii=False, indent=2),
            },
        )

        logger.info(
            "[Scriptwriter] 分镜脚本生成完成，镜头数=%d，总时长=%ds",
            len(result.shots),
            result.total_duration_seconds,
        )
        return {"scriptwriter_output": result.model_dump()}
    except ValidationError as e:
        logger.exception("[Scriptwriter] 输出校验失败")
        return {"error": f"脚本 Agent 输出格式错误: {e}"}
    except Exception as e:
        logger.exception("[Scriptwriter] 节点执行失败")
        return {"error": f"脚本 Agent 执行失败: {e}"}
