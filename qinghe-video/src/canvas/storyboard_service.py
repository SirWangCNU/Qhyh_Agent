"""画布故事板（Storyboard）服务：批量分镜生成 + 视频合成。

与 service.py（单生成节点）同层，职责单一：
- batch_generate_shots：并发为多个分镜生成图片，按参考图优先级透传，回写 ShotNode 状态。
- compose_storyboard_video：拼接各镜结果图 + 旁白（可选 TTS）→ 9:16 竖屏 mp4。

参考图优先级（每个 shot）：
    shot.reference_image_url
      → 按 reference_type 回退到 character_ref / object_ref / scene_ref
      → 无参考图则纯文生图。

纯业务逻辑，不依赖 FastAPI，可被其他脚本直接 import 调用。

用法示例::

    from src.canvas.storyboard_service import batch_generate_shots

    result = await batch_generate_shots(db, project_id, user, req)
    print([r.status for r in result.results])
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from src.assets import record_asset, url_to_local_path
from src.canvas.models import (
    GenerateResult,
    ShotInput,
    ShotResultInput,
    StoryboardComposeRequest,
    StoryboardComposeResult,
    StoryboardGenerateRequest,
    StoryboardGenerateResult,
)
from src.canvas.persistence import get_project, update_node_data
from src.config import PROJECT_ROOT, settings
from src.db.models import User
from src.image_generation import generate_with_references
from src.tts_service import _synthesize_async
from src.video_compose import compose as compose_video

logger = logging.getLogger(__name__)

# 输出目录（与 main.py 一致）
_AUDIO_DIR = PROJECT_ROOT / "outputs" / "audio"
_VIDEO_DIR = PROJECT_ROOT / "outputs" / "video"


# ---------- 参考图解析 ----------

def _resolve_shot_reference(
    shot: ShotInput,
    character_ref: str | None,
    object_ref: str | None,
    scene_ref: str | None,
) -> list[str]:
    """按优先级解析 shot 的参考图 URL 列表（content_refs）。

    优先级：
        1. shot.reference_image_url（用户在画布上为该 shot 绑定的图）
        2. 按 reference_type 回退到对应的一致性参考图
        3. 无则返回空列表（纯文生图）

    始终返回非空 URL 列表或空列表；无效 URL（空字符串）会被过滤。
    """
    if shot.reference_image_url and shot.reference_image_url.strip():
        return [shot.reference_image_url.strip()]

    fallback_map = {
        "character": character_ref,
        "object": object_ref,
        "scene": scene_ref,
    }
    if shot.reference_type:
        url = fallback_map.get(shot.reference_type)
        if url and url.strip():
            return [url.strip()]

    # 若未指定 reference_type，默认使用 character_ref（最常见的主体一致性需求）
    if character_ref and character_ref.strip():
        return [character_ref.strip()]

    return []


# ---------- 批量生成 ----------

async def _generate_single_shot(
    shot: ShotInput,
    *,
    character_ref: str | None,
    object_ref: str | None,
    scene_ref: str | None,
    size: str | None,
    model: str | None,
    db: Session,
    project_id: str,
    user_id: int,
) -> GenerateResult:
    """生成单个分镜图片，并回写 ShotNode 状态。

    失败时回写 status='error' + error，并返回 GenerateResult(error=...)。
    """
    # 标记 running（若有关联 node_id）
    if shot.node_id:
        update_node_data(db, project_id, user_id, shot.node_id, {
            "status": "running",
            "error": None,
        })

    content_refs = _resolve_shot_reference(
        shot, character_ref, object_ref, scene_ref
    )

    try:
        result_url = await generate_with_references(
            prompt=shot.visual_prompt,
            negative_prompt=None,
            content_refs=content_refs,
            style_refs=None,
            structure_refs=None,
            size=size,
            n=1,
            model=model,
        )
    except Exception as e:
        logger.exception(
            "[storyboard] 分镜生成失败 shot_id=%s project=%s",
            shot.shot_id, project_id,
        )
        if shot.node_id:
            update_node_data(db, project_id, user_id, shot.node_id, {
                "status": "error",
                "error": str(e),
            })
        return GenerateResult(
            node_id=shot.node_id or shot.shot_id,
            status="error",
            error=str(e),
        )

    # 回写成功状态与结果图
    if shot.node_id:
        update_node_data(db, project_id, user_id, shot.node_id, {
            "status": "done",
            "resultImageUrl": result_url,
            "error": None,
        })

    # 资产落库（失败仅记日志）
    try:
        record_asset(
            db,
            user_id,
            source="canvas",
            media_type="image",
            url=result_url,
            file_path=url_to_local_path(result_url),
            title=(shot.visual_prompt[:80] if shot.visual_prompt else None),
            meta={
                "project_id": project_id,
                "shot_id": shot.shot_id,
                "storyboard": True,
            },
        )
    except Exception:
        logger.warning(
            "[storyboard] 资产落库失败 url=%s", result_url, exc_info=True
        )

    return GenerateResult(
        node_id=shot.node_id or shot.shot_id,
        status="done",
        result_image_url=result_url,
    )


async def batch_generate_shots(
    db: Session,
    project_id: str,
    user: User,
    req: StoryboardGenerateRequest,
) -> StoryboardGenerateResult:
    """批量生成故事板分镜图片。

    - 校验项目归属
    - 使用 asyncio.Semaphore 限制并发（默认 3，可通过 req.concurrency 调整）
    - 每个 shot 独立 try/except，单镜失败不影响其他镜
    - 返回顺序与 req.shots 一致

    Args:
        db: 数据库会话
        project_id: 画布项目 id
        user: 当前用户（用于归属校验与资产落库）
        req: 故事板批量生成请求

    Returns:
        StoryboardGenerateResult：每个分镜的生成结果列表
    """
    project = get_project(db, project_id, user.id)
    if project is None:
        raise ValueError("画布项目不存在或无归属")

    concurrency = max(1, min(req.concurrency, 8))
    semaphore = asyncio.Semaphore(concurrency)

    async def _run_with_limit(shot: ShotInput) -> GenerateResult:
        async with semaphore:
            return await _generate_single_shot(
                shot,
                character_ref=req.character_ref,
                object_ref=req.object_ref,
                scene_ref=req.scene_ref,
                size=req.size,
                model=req.model,
                db=db,
                project_id=project_id,
                user_id=user.id,
            )

    # 并发执行所有分镜生成
    results = await asyncio.gather(*[_run_with_limit(s) for s in req.shots])

    logger.info(
        "[storyboard] 批量生成完成 project=%s shots=%d success=%d",
        project_id,
        len(req.shots),
        sum(1 for r in results if r.status == "done"),
    )

    return StoryboardGenerateResult(results=list(results))


# ---------- 视频合成 ----------

def _build_voiceover_text(req: StoryboardComposeRequest) -> str:
    """构建旁白文本：优先 voiceover_text，否则按 shot 顺序拼接 narration。"""
    if req.voiceover_text and req.voiceover_text.strip():
        return req.voiceover_text.strip()
    parts = [s.narration for s in req.shot_results if s.narration.strip()]
    return "\n".join(parts)


async def compose_storyboard_video(
    db: Session,
    project_id: str,
    user: User,
    req: StoryboardComposeRequest,
) -> StoryboardComposeResult:
    """将故事板分镜结果图与旁白合成为 9:16 竖屏 mp4。

    流程：
        1. 校验项目归属
        2. 收集所有 shot 的 image_url（按顺序）
        3. 构建旁白文本 → TTS 合成音频（若文本非空）
        4. 调 video_compose.compose 拼接图片 + 音频
        5. 资产落库

    若无可合成图片或音频，返回 status='error'。
    """
    project = get_project(db, project_id, user.id)
    if project is None:
        raise ValueError("画布项目不存在或无归属")

    image_urls = [s.image_url for s in req.shot_results if s.image_url.strip()]
    if not image_urls:
        return StoryboardComposeResult(
            status="error", error="没有可合成的分镜结果图"
        )

    voiceover_text = _build_voiceover_text(req)

    # 1. TTS 合成音频（若有旁白）
    audio_path: str | None = None
    audio_url: str | None = None
    if voiceover_text:
        _AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        audio_filename = f"storyboard_{uuid.uuid4().hex[:12]}.mp3"
        audio_full_path = _AUDIO_DIR / audio_filename
        try:
            await _synthesize_async(voiceover_text, str(audio_full_path))
            audio_path = str(audio_full_path)
            audio_url = f"/outputs/audio/{audio_filename}"
        except Exception as e:
            logger.exception("[storyboard] TTS 合成失败")
            return StoryboardComposeResult(
                status="error", error=f"TTS 合成失败: {e}"
            )
    else:
        # 无旁白时仍需要一个音频文件占位；此处返回错误更清晰
        return StoryboardComposeResult(
            status="error", error="旁白文本为空，无法合成带音频的视频"
        )

    # 2. 视频合成
    _VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    video_filename = f"storyboard_{uuid.uuid4().hex[:12]}.mp4"
    video_full_path = _VIDEO_DIR / video_filename
    try:
        compose_video(image_urls, audio_path, str(video_full_path))
    except Exception as e:
        logger.exception("[storyboard] 视频合成失败")
        return StoryboardComposeResult(
            status="error", error=f"视频合成失败: {e}"
        )

    video_url = f"/outputs/video/{video_filename}"

    # 3. 资产落库（视频 + 音频，失败仅记日志）
    try:
        record_asset(
            db,
            user.id,
            source="video_compose",
            media_type="video",
            url=video_url,
            file_path=str(video_full_path),
            filename=video_filename,
            mime_type="video/mp4",
            meta={"project_id": project_id, "storyboard": True},
        )
    except Exception:
        logger.warning("[storyboard] 视频资产落库失败", exc_info=True)

    if audio_url:
        try:
            record_asset(
                db,
                user.id,
                source="tts",
                media_type="audio",
                url=audio_url,
                file_path=audio_path,
                filename=Path(audio_path).name,
                mime_type="audio/mpeg",
                meta={"project_id": project_id, "storyboard": True},
            )
        except Exception:
            logger.warning("[storyboard] 音频资产落库失败", exc_info=True)

    logger.info(
        "[storyboard] 视频合成完成 project=%s video=%s",
        project_id, video_url,
    )

    return StoryboardComposeResult(
        status="success",
        video_url=video_url,
        audio_url=audio_url,
    )
