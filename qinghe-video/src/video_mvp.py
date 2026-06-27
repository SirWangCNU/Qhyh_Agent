"""一键成片服务：分镜取图 → TTS → 视频合成 串联编排。

把 workshop state 中视觉 Agent 产出的 shot_prompts、文案 Agent 产出的口播文本
串联起来，调用 image_generation / tts_service / video_compose 三个模块，
产出一个可下载的 mp4。

设计要点：
- 生图是 async（httpx.AsyncClient），TTS 与视频合成为同步阻塞调用。
- 本模块只负责编排与状态提取，不重复实现生图/合成逻辑。
- 所有步骤失败均抛出明确异常（ValueError 表示入参问题，RuntimeError 表示执行失败），
  由上层端点转换为 HTTP 错误码。

使用示例::

    from src.video_mvp import VideoMvpRequest, video_mvp
    req = VideoMvpRequest(state={...}, text=None)
    result = await video_mvp(req, Path("outputs/audio"), Path("outputs/video"))
    print(result["video_url"])
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from src.image_generation import ImageGenerationRequest, generate_image
from src.tts_service import synthesize as tts_synthesize
from src.video_compose import compose as compose_video

logger = logging.getLogger(__name__)

# 每张分镜图片在视频中的默认时长（秒），用于返回预估时长
_PER_IMAGE_DURATION = 3.5
# 一键成片生图尺寸（正方形，由 video_compose 裁切为 9:16）
_MVP_IMAGE_SIZE = "1920x1920"


class VideoMvpRequest(BaseModel):
    """一键成片请求：传入完整 workshop state。

    Attributes:
        state: 完整的流水线状态，至少包含 ``visual_output.shot_prompts``，
            推荐同时包含 ``copywriter_output`` 以提取旁白文本。
        text: 可选手动指定旁白文本。提供时优先于 state 中的文案。
    """

    state: dict
    text: str | None = None


def _extract_shot_prompts(state: dict[str, Any]) -> list[dict[str, Any]]:
    """从 state 中提取分镜 prompt 列表。

    兼容多种结构：
    - ``state["visual_output"]["shot_prompts"]``（标准结构）
    - ``state["shot_prompts"]``（扁平化结构）

    Returns:
        含 ``prompt`` 字段的分镜 dict 列表；无有效项时返回空列表。
    """
    visual = state.get("visual_output") or {}
    shots: Any = []
    if isinstance(visual, dict):
        shots = visual.get("shot_prompts") or []
    if not shots:
        # 兼容顶层直接放 shot_prompts 的情况
        shots = state.get("shot_prompts") or []
    if not isinstance(shots, list):
        return []
    return [s for s in shots if isinstance(s, dict) and s.get("prompt")]


def _extract_voiceover_text(state: dict[str, Any], override: str | None) -> str:
    """从 state 中提取旁白文本。

    优先级：
    1. ``override``（请求显式传入的 text）
    2. ``copywriter_output.full_script``
    3. ``copywriter_output.body`` 各段 text 拼接
    4. ``copywriter_output.hook.text`` + ``cta.text`` 拼接
    5. ``scriptwriter_output.shots[*].voiceover`` 拼接（兜底）

    Returns:
        旁白文本；无法提取时返回空字符串。
    """
    if override and override.strip():
        return override.strip()

    copy = state.get("copywriter_output") or {}
    if not isinstance(copy, dict):
        copy = {}

    # 1. full_script
    full = copy.get("full_script")
    if isinstance(full, str) and full.strip():
        return full.strip()

    # 2. body 段落拼接
    body = copy.get("body")
    if isinstance(body, list) and body:
        parts: list[str] = []
        for seg in body:
            if isinstance(seg, dict):
                t = seg.get("text")
                if isinstance(t, str) and t.strip():
                    parts.append(t.strip())
        if parts:
            return "\n".join(parts)

    # 3. hook + cta
    parts = []
    hook = copy.get("hook")
    if isinstance(hook, dict) and isinstance(hook.get("text"), str):
        parts.append(hook["text"].strip())
    cta = copy.get("cta")
    if isinstance(cta, dict) and isinstance(cta.get("text"), str):
        parts.append(cta["text"].strip())
    joined = "\n".join(p for p in parts if p)
    if joined:
        return joined

    # 4. 兜底：scriptwriter_output.shots.voiceover
    sw = state.get("scriptwriter_output") or {}
    if isinstance(sw, dict):
        shots = sw.get("shots") or []
        if isinstance(shots, list):
            parts = []
            for s in shots:
                if isinstance(s, dict):
                    v = s.get("voiceover")
                    if isinstance(v, str) and v.strip():
                        parts.append(v.strip())
            if parts:
                return "\n".join(parts)

    return ""


async def video_mvp(
    req: VideoMvpRequest, audio_dir: Path, video_dir: Path
) -> dict[str, Any]:
    """一键成片：分镜取图 → TTS → 视频合成。

    Args:
        req: 请求体，包含 state 和可选 text。
        audio_dir: 音频输出目录（需已存在）。
        video_dir: 视频输出目录（需已存在）。

    Returns:
        包含 ``status`` / ``task_id`` / ``video_url`` / ``audio_url`` /
        ``image_count`` / ``duration_estimate`` 的 dict。

    Raises:
        ValueError: 入参校验失败（分镜或旁白文本缺失）。
        RuntimeError: 生图 / TTS / 视频合成任一步骤执行失败。
    """
    state = req.state or {}

    # 1. 提取分镜 prompts
    shot_prompts = _extract_shot_prompts(state)
    if not shot_prompts:
        raise ValueError("state.visual_output.shot_prompts 为空或缺失，无法生图")

    # 2. 提取旁白文本
    voiceover = _extract_voiceover_text(state, req.text)
    if not voiceover:
        raise ValueError(
            "无法从 state 中提取旁白文本：请传入 text，或确保 state.copywriter_output 非空"
        )

    task_id = uuid.uuid4().hex[:12]
    logger.info(
        "[VideoMvp] 开始一键成片 task_id=%s shots=%d text_len=%d",
        task_id, len(shot_prompts), len(voiceover),
    )

    # 3. 逐镜生图
    image_urls: list[str] = []
    for idx, shot in enumerate(shot_prompts):
        prompt = shot.get("prompt") or ""
        negative = shot.get("negative_prompt")
        if not prompt.strip():
            logger.warning("[VideoMvp] 跳过空 prompt 的分镜 idx=%d", idx)
            continue
        gen_req = ImageGenerationRequest(
            prompt=prompt,
            negative_prompt=negative,
            size=_MVP_IMAGE_SIZE,
            n=1,
        )
        try:
            results = await generate_image(gen_req)
        except Exception as e:
            logger.exception("[VideoMvp] 分镜生图失败 idx=%d", idx)
            raise RuntimeError(f"第 {idx + 1} 张图片生成失败: {e}") from e

        if not results or not results[0].url:
            raise RuntimeError(f"第 {idx + 1} 张图片生成未返回 URL")
        image_urls.append(results[0].url)
        logger.info(
            "[VideoMvp] 分镜 %d/%d 生图完成: %s",
            idx + 1, len(shot_prompts), results[0].url,
        )

    if not image_urls:
        raise ValueError("所有分镜 prompt 均为空，无可用图片")

    # 4. TTS 合成
    audio_filename = f"mvp_{task_id}.mp3"
    audio_path = audio_dir / audio_filename
    try:
        tts_synthesize(voiceover, str(audio_path))
    except Exception as e:
        logger.exception("[VideoMvp] TTS 合成失败 task_id=%s", task_id)
        raise RuntimeError(f"TTS 合成失败: {e}") from e
    audio_url = f"/outputs/audio/{audio_filename}"
    logger.info("[VideoMvp] TTS 合成完成: %s", audio_url)

    # 5. 视频合成
    video_filename = f"mvp_{task_id}.mp4"
    video_path = video_dir / video_filename
    try:
        compose_video(image_urls, str(audio_path), str(video_path))
    except Exception as e:
        logger.exception("[VideoMvp] 视频合成失败 task_id=%s", task_id)
        raise RuntimeError(f"视频合成失败: {e}") from e
    video_url = f"/outputs/video/{video_filename}"

    logger.info("[VideoMvp] 一键成片完成 task_id=%s video=%s", task_id, video_url)

    return {
        "status": "success",
        "task_id": task_id,
        "video_url": video_url,
        "audio_url": audio_url,
        "image_count": len(image_urls),
        "duration_estimate": len(image_urls) * _PER_IMAGE_DURATION,
    }


if __name__ == "__main__":
    # 简单冒烟测试：构造最小 state，调用 video_mvp
    import asyncio

    sample_state = {
        "visual_output": {
            "shot_prompts": [
                {"shot_id": 1, "prompt": "a fresh apple on a tree, sunlight", "negative_prompt": "blurry"},
            ],
        },
        "copywriter_output": {
            "full_script": "青禾映画，让农产品故事走得更远。",
        },
    }
    sample_req = VideoMvpRequest(state=sample_state)
    result = asyncio.run(
        video_mvp(sample_req, Path("outputs/audio"), Path("outputs/video"))
    )
    print(f"[VideoMvp] 冒烟测试结果：{result}")
