"""脚本 Agent 节点。

将口播文案转化为可执行的分镜脚本，并按 ≤15s 切分为多个故事板片段，
每段附 04b 格式导演级 Storyboard Text。

调用流程（1 + N 次 LLM 调用）：
- Call 1：用 scriptwriter.txt 产出结构化 segments（每段 ≤15s，含 shots）。
- Call 2..N+1：对每个 segment 调 04b_storyboard_board.md 产该段 storyboard_text。
- 最后把 segments[].shots 平铺为 shots 字段，向后兼容 visual_designer / video_mvp。

使用示例::

    from src.nodes.scriptwriter import scriptwriter_node
    state = {"planner_output": {...}, "copywriter_output": {...}, ...}
    update = scriptwriter_node(state)
    print(update["scriptwriter_output"]["segments"])
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

from src.config import PROJECT_ROOT, get_system_prompt
from src.models import ScriptwriterOutput, StorySegment
from src.nodes.llm import get_llm
from src.utils.json_parser import invoke_structured_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("scriptwriter")
# 04b 故事板提示词是 .md 文件，get_system_prompt 只支持 .txt，
# 且 04b 原文无大括号模板变量，故直接读取原文（与 consistency_images/prompt_builder.py 一致）。
STORYBOARD_PROMPT = (
    PROJECT_ROOT / "src" / "prompts" / "04b_storyboard_board.md"
).read_text(encoding="utf-8")

# 单段故事板文本调用的温度（导演创作略高）
_STORYBOARD_TEMPERATURE = 0.6
# 04b storyboard_text 生成的最大并发数（避免对 LLM provider 造成过大压力）
_STORYBOARD_MAX_CONCURRENCY = 3
# 04b storyboard_text 生成的最大 token 数（单段输出通常 2000-3500 字符）
_STORYBOARD_MAX_TOKENS = 4000


def scriptwriter_node(state: dict[str, Any]) -> dict[str, Any]:
    """脚本节点：生成 ≤15s 分段脚本 + 每段故事板文本。

    Args:
        state: 全局共享状态，需含 planner_output 与 copywriter_output。

    Returns:
        dict: ``{"scriptwriter_output": {...}}``，含 segments 与平铺 shots；
        失败时返回 ``{"error": ...}``。
    """
    logger.info("[Scriptwriter] 开始生成分段分镜脚本")
    try:
        planner_output = state.get("planner_output", {})
        copywriter_output = state.get("copywriter_output", {})

        llm = get_llm(temperature=0.7)

        # ── Call 1：结构化产出 segments（每段 ≤15s，含 shots）──
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请根据以下策划与文案生成分镜脚本，并按 ≤15s 切分为多个片段。\n\n"
                    "【产品信息】\n"
                    "产品：{product_name}，产地：{origin}，"
                    "目标平台：{target_platform}，目标时长：{target_duration}\n\n"
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
                "planner_output": json.dumps(
                    planner_output, ensure_ascii=False, indent=2
                ),
                "copywriter_output": json.dumps(
                    copywriter_output, ensure_ascii=False, indent=2
                ),
            },
        )

        # ── 平铺 shots（向后兼容 visual_designer / video_mvp / 画布导出）──
        flat_shots: list[dict[str, Any]] = [
            s.model_dump() for seg in result.segments for s in seg.shots
        ]

        # ── Call 2..N+1：并发为每段调 04b 提示词产 storyboard_text ──
        # 限制 max_tokens 以控制单段 04b 输出长度，降低超时风险。
        sb_llm = get_llm(
            temperature=_STORYBOARD_TEMPERATURE,
            max_tokens=_STORYBOARD_MAX_TOKENS,
        )
        _fill_storyboard_texts_concurrent(result.segments, sb_llm)

        data = result.model_dump()
        data["shots"] = flat_shots

        logger.info(
            "[Scriptwriter] 完成：片段数=%d，总镜数=%d，总时长=%ds",
            len(result.segments),
            len(flat_shots),
            result.total_duration_seconds,
        )
        return {"scriptwriter_output": data}
    except ValidationError as e:
        logger.exception("[Scriptwriter] 输出校验失败")
        return {"error": f"脚本 Agent 输出格式错误: {e}"}
    except Exception as e:
        logger.exception("[Scriptwriter] 节点执行失败")
        return {"error": f"脚本 Agent 执行失败: {e}"}


def _fill_storyboard_texts_concurrent(
    segments: list[StorySegment], llm: Any, max_concurrency: int = _STORYBOARD_MAX_CONCURRENCY
) -> None:
    """并发为所有 segment 生成 storyboard_text 并回填到对象中。

    使用 asyncio.gather + Semaphore 控制并发，避免对 LLM provider 造成过大压力。
    同步接口内部启动临时事件循环；FastAPI 同步端点运行在线程池，无 running loop，
    因此 asyncio.run 可安全使用。

    Args:
        segments: 待填充 storyboard_text 的片段列表。
        llm: 已配置好温度的 ChatOpenAI 实例。
        max_concurrency: 最大并发数。
    """

    async def _fill_all() -> None:
        semaphore = asyncio.Semaphore(max_concurrency)

        async def _with_sem(seg: StorySegment) -> None:
            async with semaphore:
                seg.storyboard_text = await _generate_storyboard_text_async(llm, seg)

        await asyncio.gather(*(_with_sem(seg) for seg in segments))

    try:
        # 绝大多数调用场景（FastAPI 同步端点、独立脚本）没有 running loop
        asyncio.run(_fill_all())
    except RuntimeError as e:
        # 防御性处理：若调用方已在事件循环中（如某些测试框架），退回到顺序执行
        if "already running" in str(e).lower():
            logger.warning(
                "[Scriptwriter] 检测到已有事件循环，退回到顺序生成 storyboard_text: %s",
                e,
            )
            for seg in segments:
                seg.storyboard_text = _generate_storyboard_text_sync(llm, seg)
        else:
            raise


async def _generate_storyboard_text_async(llm: Any, segment: StorySegment) -> str:
    """异步对单个 ≤15s 片段调用 04b 提示词，返回 Storyboard Text。"""
    sb_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", STORYBOARD_PROMPT),
            (
                "human",
                "请把以下分镜片段转换为导演级 Storyboard Text"
                "（≤15s，严格遵守 04b 规则）。\n\n"
                "【片段信息】\n"
                "segment_id: {segment_id}\n"
                "时长: {start_time}-{end_time}（{duration}s）\n\n"
                "【该段镜头】\n{shots_json}",
            ),
        ]
    )
    try:
        chain = sb_prompt | llm
        resp = await chain.ainvoke(
            {
                "segment_id": segment.segment_id,
                "start_time": segment.start_time,
                "end_time": segment.end_time,
                "duration": segment.duration_seconds,
                "shots_json": json.dumps(
                    [s.model_dump() for s in segment.shots],
                    ensure_ascii=False,
                    indent=2,
                ),
            }
        )
        content = getattr(resp, "content", str(resp))
        if not isinstance(content, str):
            content = str(content)
        logger.info(
            "[Scriptwriter] 片段 %d 故事板文本生成完成，长度=%d",
            segment.segment_id,
            len(content),
        )
        return content.strip()
    except Exception:
        logger.exception(
            "[Scriptwriter] 片段 %d 故事板文本生成失败",
            segment.segment_id,
        )
        return ""


def _generate_storyboard_text_sync(llm: Any, segment: StorySegment) -> str:
    """同步对单个 ≤15s 片段调用 04b 提示词，返回 Storyboard Text。

    作为已有事件循环场景下的降级方案。
    """
    sb_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", STORYBOARD_PROMPT),
            (
                "human",
                "请把以下分镜片段转换为导演级 Storyboard Text"
                "（≤15s，严格遵守 04b 规则）。\n\n"
                "【片段信息】\n"
                "segment_id: {segment_id}\n"
                "时长: {start_time}-{end_time}（{duration}s）\n\n"
                "【该段镜头】\n{shots_json}",
            ),
        ]
    )
    try:
        chain = sb_prompt | llm
        resp = chain.invoke(
            {
                "segment_id": segment.segment_id,
                "start_time": segment.start_time,
                "end_time": segment.end_time,
                "duration": segment.duration_seconds,
                "shots_json": json.dumps(
                    [s.model_dump() for s in segment.shots],
                    ensure_ascii=False,
                    indent=2,
                ),
            }
        )
        content = getattr(resp, "content", str(resp))
        if not isinstance(content, str):
            content = str(content)
        logger.info(
            "[Scriptwriter] 片段 %d 故事板文本生成完成，长度=%d",
            segment.segment_id,
            len(content),
        )
        return content.strip()
    except Exception:
        logger.exception(
            "[Scriptwriter] 片段 %d 故事板文本生成失败",
            segment.segment_id,
        )
        return ""
