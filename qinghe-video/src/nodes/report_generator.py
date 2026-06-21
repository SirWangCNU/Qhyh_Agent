"""报告生成节点。

将所有 Agent 的输出整合为可读的 Markdown 报告。
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _safe_dump(obj: Any) -> str:
    """安全地将对象转为 JSON 字符串。"""
    if isinstance(obj, (dict, list)):
        return json.dumps(obj, ensure_ascii=False, indent=2)
    return str(obj)


def report_generator_node(state: dict[str, Any]) -> dict[str, Any]:
    """报告生成节点：汇总全链路输出为 Markdown。

    Args:
        state: 全局共享状态。

    Returns:
        dict: 包含 `final_report` 的状态片段。
    """
    logger.info("[Report] 开始生成最终报告")
    try:
        if state.get("error"):
            return {"final_report": f"## 执行出错\n\n节点返回错误：\n\n```\n{state['error']}\n```"}

        planner = state.get("planner_output", {})
        copywriter = state.get("copywriter_output", {})
        scriptwriter = state.get("scriptwriter_output", {})
        visual = state.get("visual_output", {})
        distributor = state.get("distributor_output", {})

        md_parts: list[str] = []

        # 标题
        md_parts.append(f"# 青禾映画 · 短视频创作方案\n")
        md_parts.append(
            f"> 产品：**{state.get('product_name', '')}** · "
            f"产地：**{state.get('origin', '')}** · "
            f"目标平台：**{state.get('target_platform', '')}**\n"
        )

        # 1. 策划
        md_parts.append("## 一、策划方案\n")
        if planner:
            md_parts.append(f"- **主题**：{planner.get('theme', '')}")
            md_parts.append(f"- **视频类型**：{planner.get('video_type', '')}")
            md_parts.append(f"- **情绪基调**：{planner.get('emotion_tone', '')}")
            md_parts.append(f"- **创意角度**：{planner.get('creative_angle', '')}")
            points = planner.get("core_selling_points", [])
            md_parts.append("- **核心卖点**：")
            for p in points:
                md_parts.append(f"  - {p}")
            audience = planner.get("target_audience", {})
            md_parts.append(
                f"- **目标受众**：{audience.get('age_range', '')} / "
                f"{audience.get('region', '')} / {audience.get('consumer_profile', '')}"
            )
            if planner.get("strategy_notes"):
                md_parts.append(f"- **策略备注**：{planner['strategy_notes']}")
            md_parts.append("")

        # 2. 文案
        md_parts.append("## 二、口播文案\n")
        if copywriter:
            hook = copywriter.get("hook", {})
            md_parts.append(f"### Hook（开头钩子）\n> {hook.get('text', '')}\n> \n> *语气提示：{hook.get('delivery_note', '')}*\n")
            md_parts.append("### 正文\n")
            for seg in copywriter.get("body", []):
                md_parts.append(f"**段落 {seg.get('segment', '')}**：{seg.get('text', '')}")
                md_parts.append(f"*语气提示：{seg.get('delivery_note', '')}*\n")
            cta = copywriter.get("cta", {})
            md_parts.append(f"### CTA（行动号召）\n> {cta.get('text', '')}\n> \n> *语气提示：{cta.get('delivery_note', '')}*\n")
            md_parts.append(
                f"_预计时长：{copywriter.get('estimated_duration_seconds', '')} 秒 · "
                f"字数：{copywriter.get('word_count', '')}_\n"
            )
            md_parts.append("### 完整口播文案\n```\n" + copywriter.get("full_script", "") + "\n```\n")

        # 3. 分镜脚本
        md_parts.append("## 三、分镜脚本\n")
        if scriptwriter:
            md_parts.append(f"**视频标题**：{scriptwriter.get('title', '')}\n")
            md_parts.append(f"**总时长**：{scriptwriter.get('total_duration_seconds', '')} 秒\n")
            bgm = scriptwriter.get("bgm_suggestion", {})
            md_parts.append(
                f"**BGM 建议**：{bgm.get('style', '')}（{bgm.get('bpm_range', '')} BPM，"
                f"{bgm.get('mood', '')}，参考：{bgm.get('reference', '')}）\n"
            )
            md_parts.append("| 镜头 | 时间 | 时长 | 景别 | 运镜 | 画面描述 | 旁白 | 字幕 | 转场 |")
            md_parts.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
            for shot in scriptwriter.get("shots", []):
                md_parts.append(
                    f"| {shot.get('shot_id', '')} | "
                    f"{shot.get('start_time', '')}-{shot.get('end_time', '')} | "
                    f"{shot.get('duration_seconds', '')}s | "
                    f"{shot.get('shot_type', '')} | "
                    f"{shot.get('camera_movement', '')} | "
                    f"{shot.get('visual_description', '')} | "
                    f"{shot.get('voiceover', '')} | "
                    f"{shot.get('text_overlay', '') or ''} | "
                    f"{shot.get('transition', '')} |"
                )
            md_parts.append("")
            if scriptwriter.get("production_notes"):
                md_parts.append(f"**制作备注**：{scriptwriter['production_notes']}\n")

        # 4. 视觉方案
        md_parts.append("## 四、AI 视觉素材 Prompt\n")
        if visual:
            style = visual.get("visual_style", {})
            md_parts.append(f"- **整体风格**：{style.get('style', '')}")
            md_parts.append(f"- **色调**：{style.get('color_palette', '')}")
            md_parts.append(f"- **画幅**：{style.get('aspect_ratio', '')}")
            md_parts.append(f"- **质量标签**：`{style.get('quality_tags', '')}`\n")
            md_parts.append("### 各镜头 Prompt\n")
            for sp in visual.get("shot_prompts", []):
                md_parts.append(f"#### 镜头 {sp.get('shot_id', '')}")
                md_parts.append(f"- **Prompt**：`{sp.get('prompt', '')}`")
                md_parts.append(f"- **Negative Prompt**：`{sp.get('negative_prompt', '')}`")
                md_parts.append(f"- **推荐工具**：{sp.get('recommended_tool', '')}")
                md_parts.append(f"- **画幅**：{sp.get('aspect_ratio', '')}")
                md_parts.append(f"- **风格参考**：{sp.get('reference_style', '')}\n")
            md_parts.append(f"**一致性说明**：{visual.get('consistency_guide', '')}\n")

        # 5. 投放方案
        md_parts.append("## 五、投放策略\n")
        if distributor:
            md_parts.append(f"**目标平台**：{distributor.get('platform', '')}\n")
            specs = distributor.get("video_specs", {})
            md_parts.append(
                f"- **视频规格**：{specs.get('resolution', '')} / {specs.get('aspect_ratio', '')} / "
                f"{specs.get('max_duration', '')} / {specs.get('file_format', '')} / {specs.get('fps', '')}fps"
            )
            pub = distributor.get("publish_content", {})
            md_parts.append(f"- **标题**：{pub.get('title', '')}")
            md_parts.append(f"- **描述**：{pub.get('description', '')}")
            md_parts.append(f"- **Hashtags**：{' '.join(pub.get('hashtags', []))}")
            if pub.get("mention"):
                md_parts.append(f"- **提及**：{pub['mention']}")
            strategy = distributor.get("publish_strategy", {})
            md_parts.append(
                f"- **最佳发布时间**：{strategy.get('best_time', '')}（{', '.join(strategy.get('best_days', []))}）"
            )
            md_parts.append(f"- **发布频率**：{strategy.get('frequency', '')}")
            md_parts.append(f"- **首条评论**：{strategy.get('first_comment', '')}\n")
            md_parts.append("### 推广建议\n")
            for promo in distributor.get("promotion_suggestions", []):
                md_parts.append(
                    f"- **{promo.get('type', '')}**：{promo.get('description', '')}"
                    + (f"（预算：{promo.get('budget_hint', '')}）" if promo.get("budget_hint") else "")
                )
            md_parts.append("")
            md_parts.append(f"**平台备注**：{distributor.get('platform_specific_notes', '')}\n")

        md_parts.append("---\n_由青禾映画 MVP 多 Agent 流水线自动生成_")

        report = "\n".join(md_parts)
        logger.info("[Report] 最终报告生成完成，长度=%d 字符", len(report))
        return {"final_report": report}
    except Exception as e:
        logger.exception("[Report] 报告生成失败")
        return {"final_report": f"## 报告生成失败\n\n```\n{e}\n```"}
