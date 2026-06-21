"""视觉 Agent 节点。

将分镜脚本中的中文画面描述转化为英文 AI 生图 / 生视频 prompt。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import get_system_prompt
from src.models import VisualOutput
from src.nodes.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("visual_designer")


def visual_designer_node(state: dict[str, Any]) -> dict[str, Any]:
    """视觉节点：生成英文 AI 绘图 prompt 与风格统一方案。

    Args:
        state: 全局共享状态。

    Returns:
        dict: 更新后的状态片段。
    """
    logger.info("[VisualDesigner] 开始生成视觉 prompt")
    try:
        scriptwriter_output = state.get("scriptwriter_output", {})
        target_platform = state.get("target_platform", "抖音")
        # 抖音/快手/视频号默认竖屏，B 站默认横屏
        default_ratio = "16:9" if "B站" in target_platform else "9:16"

        llm = get_llm(temperature=0.7)
        structured_llm = llm.with_structured_output(VisualOutput)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请根据以下分镜脚本生成英文 AI 生图 prompt：\n\n"
                    "目标平台：{target_platform}（默认画面比例：{default_ratio}）\n\n"
                    "【分镜脚本】\n{scriptwriter_output}",
                ),
            ]
        )

        chain = prompt | structured_llm
        result: VisualOutput = chain.invoke(
            {
                "target_platform": target_platform,
                "default_ratio": default_ratio,
                "scriptwriter_output": json.dumps(scriptwriter_output, ensure_ascii=False, indent=2),
            }
        )

        logger.info(
            "[VisualDesigner] 视觉 prompt 生成完成，镜头数=%d",
            len(result.shot_prompts),
        )
        return {"visual_output": result.model_dump()}
    except ValidationError as e:
        logger.exception("[VisualDesigner] 输出校验失败")
        return {"error": f"视觉 Agent 输出格式错误: {e}"}
    except Exception as e:
        logger.exception("[VisualDesigner] 节点执行失败")
        return {"error": f"视觉 Agent 执行失败: {e}"}
