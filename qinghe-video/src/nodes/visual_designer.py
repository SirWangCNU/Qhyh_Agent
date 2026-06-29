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
from src.utils.json_parser import invoke_structured_llm

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

        # 一致性参考（工坊第 3 步建立的人物/物品/场景描述；完整流水线无此字段，向后兼容）
        consistency_refs = state.get("consistency_references") or {}
        consistency_lines: list[str] = []
        if consistency_refs.get("character"):
            consistency_lines.append(f"- 人物：{consistency_refs['character']}")
        if consistency_refs.get("object"):
            consistency_lines.append(f"- 物品：{consistency_refs['object']}")
        if consistency_refs.get("scene"):
            consistency_lines.append(f"- 场景：{consistency_refs['scene']}")
        consistency_section = ""
        if consistency_lines:
            consistency_section = (
                "\n\n【一致性参考】\n"
                "以下主体已在第 3 步建立一致性参考图，生成 shot prompt 时必须嵌入这些主体描述关键词，"
                "保持人物五官/服装、物品形态、场景元素与前序参考一致：\n"
                + "\n".join(consistency_lines)
            )

        llm = get_llm(temperature=0.7)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请根据以下分镜脚本生成英文 AI 生图 prompt：\n\n"
                    "目标平台：{target_platform}（默认画面比例：{default_ratio}）\n\n"
                    "【分镜脚本】\n{scriptwriter_output}{consistency_section}",
                ),
            ]
        )

        result: VisualOutput = invoke_structured_llm(
            llm,
            prompt,
            VisualOutput,
            {
                "target_platform": target_platform,
                "default_ratio": default_ratio,
                "scriptwriter_output": json.dumps(scriptwriter_output, ensure_ascii=False, indent=2),
                "consistency_section": consistency_section,
            },
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
