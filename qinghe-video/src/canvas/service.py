"""画布生成编排服务：收集参考图 → 调 image_generation → 回写节点状态。

纯业务逻辑，不依赖 FastAPI，可被其他脚本直接 import 调用。
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from src.assets import record_asset, url_to_local_path
from src.canvas.models import GenerateRequest, GenerateMode, GenerateResult, ReferenceInput
from src.canvas.persistence import get_project, update_node_data
from src.db.models import User
from src.image_generation import generate_with_references
from src.video_generation import VideoGenerationRequest, generate_video

logger = logging.getLogger(__name__)

# #region debug-point setup:debug-reporter
_DEBUG_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".dbg", "canvas-two-refs-disconnect.env")
_DEBUG_SERVER_URL = "http://127.0.0.1:7777/event"
_DEBUG_SESSION_ID = "canvas-two-refs-disconnect"
try:
    with open(_DEBUG_ENV_PATH, "r", encoding="utf-8") as _f:
        for _line in _f:
            if _line.startswith("DEBUG_SERVER_URL="):
                _DEBUG_SERVER_URL = _line.strip().split("=", 1)[1]
            elif _line.startswith("DEBUG_SESSION_ID="):
                _DEBUG_SESSION_ID = _line.strip().split("=", 1)[1]
except Exception:
    pass


def _report_debug(hypothesis_id: str, location: str, msg: str, data: dict | None = None, run_id: str = "pre-fix") -> None:
    try:
        payload = json.dumps({
            "sessionId": _DEBUG_SESSION_ID,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "msg": f"[DEBUG] {msg}",
            "data": data or {},
        }).encode("utf-8")
        urllib.request.urlopen(
            urllib.request.Request(_DEBUG_SERVER_URL, data=payload, headers={"Content-Type": "application/json"}),
            timeout=2,
        ).read()
    except Exception:
        pass
# #endregion


# #region debug-point Z:video-ascii-reporter
_VIDEO_ASCII_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".dbg", "video-ascii-encode-error.env")
_VIDEO_ASCII_SERVER_URL = "http://127.0.0.1:7777/event"
_VIDEO_ASCII_SESSION_ID = "video-ascii-encode-error"
try:
    with open(_VIDEO_ASCII_ENV_PATH, "r", encoding="utf-8") as _f:
        for _line in _f:
            if _line.startswith("DEBUG_SERVER_URL="):
                _VIDEO_ASCII_SERVER_URL = _line.strip().split("=", 1)[1]
            elif _line.startswith("DEBUG_SESSION_ID="):
                _VIDEO_ASCII_SESSION_ID = _line.strip().split("=", 1)[1]
except Exception:
    pass


def _report_video_ascii(hypothesis_id: str, location: str, msg: str, data: dict | None = None, run_id: str = "pre-fix") -> None:
    try:
        payload = json.dumps({
            "sessionId": _VIDEO_ASCII_SESSION_ID,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "msg": f"[DEBUG] {msg}",
            "data": data or {},
        }, ensure_ascii=False, default=str).encode("utf-8")
        urllib.request.urlopen(
            urllib.request.Request(_VIDEO_ASCII_SERVER_URL, data=payload, headers={"Content-Type": "application/json"}),
            timeout=2,
        ).read()
    except Exception:
        pass
# #endregion


def _group_refs_by_type(
    references: list[ReferenceInput],
) -> dict[str, list[str]]:
    """按 ref_type 分组参考图 URL。

    返回 {"content": [...], "style": [...], "structure": [...], "pose": [...]}。
    pose 暂未在 image_generation 中单独处理，归入 content 主参考候选。
    """
    groups: dict[str, list[str]] = {
        "content": [],
        "style": [],
        "structure": [],
        "pose": [],
    }
    for ref in references:
        if ref.image_url and ref.ref_type in groups:
            groups[ref.ref_type].append(ref.image_url)
    return groups


async def run_generate(
    db: Session,
    project_id: str,
    user: User,
    req: GenerateRequest,
) -> GenerateResult:
    """执行生成节点：根据 mode 分派到图片或视频生成服务。"""
    if req.mode == "video":
        return await run_generate_video(db, project_id, user, req)
    return await run_generate_image(db, project_id, user, req)


async def run_generate_image(
    db: Session,
    project_id: str,
    user: User,
    req: GenerateRequest,
) -> GenerateResult:
    """执行图片生成节点：收集入边参考图 → 调生成 → 回写结果。

    流程：
    1. 校验项目归属
    2. 标记节点 status='running'
    3. 按 ref_type 分组参考图
    4. 调 image_generation.generate_with_references
    5. 回写 status='done' + resultImageUrl
    6. 资产落库（失败仅记日志）

    生成失败时回写 status='error' + error，并返回 GenerateResult(error=...)。
    """
    # #region debug-point B:service-entry
    _report_debug("B", "service.py:run_generate_image", "service 入口", {
        "project_id": project_id,
        "node_id": req.node_id,
        "references_count": len(req.references),
        "prompt": req.prompt,
        "params": req.params,
    })
    # #endregion

    project = get_project(db, project_id, user.id)
    if project is None:
        # #region debug-point B:project-not-found
        _report_debug("B", "service.py:run_generate_image", "项目不存在", {"project_id": project_id})
        # #endregion
        raise ValueError("画布项目不存在或无归属")

    # 1. 标记节点为 running
    update_node_data(db, project_id, user.id, req.node_id, {
        "status": "running",
        "error": None,
    })

    # 2. 分组参考图
    refs = _group_refs_by_type(req.references)
    params = req.params or {}
    size = params.get("size")
    model = params.get("model")
    if isinstance(model, str):
        model = model.strip() or None
    else:
        model = None
    # #region debug-point B:refs-grouped
    _report_debug("B", "service.py:run_generate_image", "参考图分组", {
        "content_count": len(refs["content"]),
        "style_count": len(refs["style"]),
        "structure_count": len(refs["structure"]),
        "pose_count": len(refs["pose"]),
        "size": size,
        "model": model,
    })
    # #endregion

    try:
        # 3. 调生成（content 主参考 + style/structure 文字降级）
        # #region debug-point B:before-generate
        _report_debug("B", "service.py:run_generate_image", "调用 generate_with_references 前", {
            "content_refs": refs["content"],
            "style_refs": refs["style"],
            "structure_refs": refs["structure"],
            "size": size,
            "model": model,
        })
        # #endregion
        result_url = await generate_with_references(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            content_refs=refs["content"],
            style_refs=refs["style"],
            structure_refs=refs["structure"],
            size=size,
            model=model,
        )
    except Exception as e:
        # #region debug-point B:generate-exception
        _report_debug("B", "service.py:run_generate_image", "生成异常", {"error": str(e), "error_type": type(e).__name__})
        # #endregion
        logger.exception(
            "[canvas] generation failed node=%s project=%s", req.node_id, project_id
        )
        update_node_data(db, project_id, user.id, req.node_id, {
            "status": "error",
            "error": str(e),
        })
        return GenerateResult(
            node_id=req.node_id,
            status="error",
            error=str(e),
        )

    # 4. 回写结果
    update_node_data(db, project_id, user.id, req.node_id, {
        "status": "done",
        "resultImageUrl": result_url,
        "error": None,
    })

    # 5. 资产落库（失败仅记日志，不阻断主流程）
    try:
        record_asset(
            db,
            user.id,
            source="canvas",
            media_type="image",
            url=result_url,
            file_path=url_to_local_path(result_url),
            title=(req.prompt[:80] if req.prompt else None),
            meta={"project_id": project_id, "node_id": req.node_id},
        )
    except Exception:
        logger.warning(
            "[canvas] asset persist failed url=%s", result_url, exc_info=True
        )

    logger.info(
        "[canvas] generation completed node=%s project=%s url=%s",
        req.node_id, project_id, result_url,
    )
    return GenerateResult(
        node_id=req.node_id,
        status="done",
        result_image_url=result_url,
    )


async def run_generate_video(
    db: Session,
    project_id: str,
    user: User,
    req: GenerateRequest,
) -> GenerateResult:
    """执行视频生成节点：收集参考图 → 提交异步任务 → 轮询 → 下载 → 回写结果。"""
    project = get_project(db, project_id, user.id)
    if project is None:
        raise ValueError("画布项目不存在或无归属")

    # 标记节点为 running
    update_node_data(db, project_id, user.id, req.node_id, {
        "status": "running",
        "error": None,
    })

    params = req.params or {}
    content_refs = [
        r.image_url for r in req.references if r.ref_type == "content" and r.image_url
    ]

    # #region debug-point A:run_generate_video-entry
    _report_video_ascii(
        "A",
        "service.py:run_generate_video:entry",
        "run_generate_video entry",
        {"node_id": req.node_id, "project_id": project_id, "mode": req.mode, "params": params, "ref_count": len(content_refs)},
    )
    # #endregion

    try:
        # #region debug-point C:before-generate-video
        _report_video_ascii(
            "C",
            "service.py:run_generate_video:before-generate",
            "about to call generate_video",
            {
                "model": params.get("model"),
                "resolution": params.get("resolution"),
                "ratio": params.get("ratio"),
                "duration": params.get("duration"),
                "generate_audio": params.get("generate_audio"),
                "watermark": params.get("watermark"),
                "prompt_preview": req.prompt[:200],
                "ref_count": len(content_refs),
            },
        )
        # #endregion
        result = await generate_video(
            VideoGenerationRequest(
                prompt=req.prompt,
                model=params.get("model") if isinstance(params.get("model"), str) else None,
                reference_images=content_refs,
                resolution=params.get("resolution") if isinstance(params.get("resolution"), str) else None,
                ratio=params.get("ratio") if isinstance(params.get("ratio"), str) else None,
                duration=int(params.get("duration", 8)) if params.get("duration") is not None else 8,
                generate_audio=bool(params.get("generate_audio", True)),
                watermark=bool(params.get("watermark", False)),
                negative_prompt=req.negative_prompt,
            )
        )
        # #region debug-point C:after-generate-video
        _report_video_ascii(
            "C",
            "service.py:run_generate_video:after-generate",
            "generate_video returned",
            {
                "status": result.status,
                "error": result.error,
                "video_url": result.video_url,
                "task_id": result.task_id,
            },
        )
        # #endregion
    except Exception as e:
        # #region debug-point A:run-generate-video-exception
        import traceback as _tb

        _report_video_ascii(
            "A",
            "service.py:run_generate_video:exception",
            "exception in run_generate_video",
            {
                "exc_type": type(e).__name__,
                "exc_str": str(e),
                "traceback": _tb.format_exc(),
            },
        )
        # #endregion
        logger.exception(
            "[canvas] video generation failed node=%s project=%s", req.node_id, project_id
        )
        update_node_data(db, project_id, user.id, req.node_id, {
            "status": "error",
            "error": str(e),
        })
        return GenerateResult(
            node_id=req.node_id,
            status="error",
            error=str(e),
        )

    if result.status != "done" or not result.video_url:
        error_msg = result.error or "视频生成失败"
        update_node_data(db, project_id, user.id, req.node_id, {
            "status": "error",
            "error": error_msg,
        })
        return GenerateResult(
            node_id=req.node_id,
            status="error",
            error=error_msg,
        )

    # 回写结果
    update_node_data(db, project_id, user.id, req.node_id, {
        "status": "done",
        "resultVideoUrl": result.video_url,
        "error": None,
    })

    # 资产落库
    try:
        record_asset(
            db,
            user.id,
            source="canvas",
            media_type="video",
            url=result.video_url,
            file_path=url_to_local_path(result.video_url),
            title=(req.prompt[:80] if req.prompt else None),
            meta={
                "project_id": project_id,
                "node_id": req.node_id,
                "task_id": result.task_id,
            },
        )
    except Exception:
        logger.warning(
            "[canvas] video asset persist failed url=%s", result.video_url, exc_info=True
        )

    logger.info(
        "[canvas] video generation completed node=%s project=%s url=%s",
        req.node_id, project_id, result.video_url,
    )
    return GenerateResult(
        node_id=req.node_id,
        status="done",
        result_video_url=result.video_url,
    )
