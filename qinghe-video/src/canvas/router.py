"""无限画布 FastAPI 路由。

端点（全部走 Depends(get_current_user) 鉴权）：
- POST   /api/canvas/projects              创建画布项目
- GET    /api/canvas/projects              列出当前用户项目
- GET    /api/canvas/projects/{id}         获取完整项目
- PUT    /api/canvas/projects/{id}         更新项目（自动保存）
- DELETE /api/canvas/projects/{id}         删除项目
- POST   /api/canvas/projects/{id}/generate 触发生成节点
- POST   /api/canvas/upload                上传参考图
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from src.assets import save_uploaded_file
from src.auth.dependencies import get_current_user
from src.config import get_image_model_options
from src.canvas.models import (
    CanvasProjectCreate,
    CanvasProjectUpdate,
    GenerateRequest,
    StoryboardComposeRequest,
    StoryboardComposeResult,
    StoryboardGenerateRequest,
    StoryboardGenerateResult,
)
from src.canvas.persistence import (
    create_project,
    delete_project,
    get_project,
    list_projects,
    to_response_dict,
    update_project,
)
from src.canvas.service import run_generate
from src.canvas.storyboard_service import (
    batch_generate_shots,
    compose_storyboard_video,
)
from src.db.database import get_db
from src.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["canvas"])

# #region debug-point setup:debug-reporter
_DEBUG_ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".dbg", "canvas-two-refs-disconnect.env")
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

# 允许的参考图 MIME 类型
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}


# ---------- 可选模型列表 ----------

@router.get("/api/canvas/models", summary="列出可选图片模型")
def list_models_api(
    _current_user: User = Depends(get_current_user),
) -> list[str]:
    """返回前端生成节点可选的图片模型列表。

    来源：settings.IMAGE_MODEL_OPTIONS（逗号分隔），未配置时回退为 [IMAGE_MODEL]。
    """
    return get_image_model_options()


# ---------- 项目 CRUD ----------

@router.post("/api/canvas/projects", summary="创建画布项目")
def create_project_api(
    req: CanvasProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """创建一个空白画布项目。"""
    project = create_project(
        db,
        current_user.id,
        name=req.name,
        nodes=req.nodes,
        edges=req.edges,
        viewport=req.viewport,
    )
    return to_response_dict(project)


@router.get("/api/canvas/projects", summary="列出画布项目")
def list_projects_api(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """列出当前用户所有画布项目（按更新时间倒序）。"""
    return list_projects(db, current_user.id)


@router.get("/api/canvas/projects/{project_id}", summary="获取画布项目")
def get_project_api(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """获取完整画布项目（含 nodes/edges/viewport）。"""
    project = get_project(db, project_id, current_user.id)
    if project is None:
        raise HTTPException(status_code=404, detail="画布项目不存在")
    return to_response_dict(project)


@router.put("/api/canvas/projects/{project_id}", summary="更新画布项目")
def update_project_api(
    project_id: str,
    req: CanvasProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """更新画布项目（前端 debounce 2s 自动保存触发）。"""
    project = update_project(
        db,
        project_id,
        current_user.id,
        name=req.name,
        nodes=req.nodes,
        edges=req.edges,
        viewport=req.viewport,
    )
    if project is None:
        raise HTTPException(status_code=404, detail="画布项目不存在")
    return to_response_dict(project)


@router.delete("/api/canvas/projects/{project_id}", summary="删除画布项目")
def delete_project_api(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """删除画布项目。"""
    ok = delete_project(db, project_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="画布项目不存在")
    return {"status": "deleted"}


# ---------- 生成编排 ----------

@router.post(
    "/api/canvas/projects/{project_id}/generate",
    summary="触发画布生成节点",
)
async def generate_node_api(
    project_id: str,
    req: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """触发指定生成节点：收集入边参考图 + 提示词 → 调图片生成 → 回写结果。

    返回 GenerateResult：{ node_id, status, result_image_url?, error? }
    """
    # #region debug-point A:router-entry
    _report_debug("A", "router.py:generate_node_api", "生成请求入口", {
        "project_id": project_id,
        "node_id": req.node_id,
        "references_count": len(req.references),
        "references": [{"ref_type": r.ref_type, "image_url": r.image_url} for r in req.references],
        "prompt": req.prompt,
        "params": req.params,
    })
    # #endregion
    try:
        result = await run_generate(db, project_id, current_user, req)
    except ValueError as e:
        # #region debug-point A:router-value-error
        _report_debug("A", "router.py:generate_node_api", "ValueError", {"error": str(e)})
        # #endregion
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        # #region debug-point A:router-exception
        _report_debug("A", "router.py:generate_node_api", "未捕获异常", {"error": str(e), "error_type": type(e).__name__})
        # #endregion
        logger.exception(
            "[API] 画布生成失败 project=%s node=%s", project_id, req.node_id
        )
        raise HTTPException(status_code=500, detail=f"生成失败: {e}") from e
    # #region debug-point A:router-success
    _report_debug("A", "router.py:generate_node_api", "生成请求成功", {
        "status": result.status,
        "result_image_url": result.result_image_url,
        "error": result.error,
    })
    # #endregion
    return result.model_dump()


# ---------- 故事板批量生成与合成 ----------

@router.post(
    "/api/canvas/projects/{project_id}/storyboard/generate",
    summary="批量生成故事板分镜图片",
)
async def generate_storyboard_api(
    project_id: str,
    req: StoryboardGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """批量为故事板分镜生成图片。

    - 按 shot 顺序并发生成（并发数由 req.concurrency 控制，默认 3）
    - 每个 shot 的参考图优先级：shot.reference_image_url → character/object/scene_ref
    - 生成成功后回写对应 ShotNode 的 status/resultImageUrl
    - 返回 StoryboardGenerateResult：每个分镜的结果列表（顺序与请求一致）
    """
    try:
        result = await batch_generate_shots(db, project_id, current_user, req)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception(
            "[API] 故事板批量生成失败 project=%s", project_id
        )
        raise HTTPException(status_code=500, detail=f"故事板生成失败: {e}") from e
    return result.model_dump()


@router.post(
    "/api/canvas/projects/{project_id}/storyboard/compose",
    summary="故事板分镜图合成视频",
)
async def compose_storyboard_api(
    project_id: str,
    req: StoryboardComposeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """将故事板分镜结果图与旁白合成为 9:16 竖屏 mp4。

    - 收集各 shot 的 image_url（按顺序）
    - 旁白优先 req.voiceover_text，否则拼接各 shot narration
    - TTS 合成音频 → video_compose 拼接图片 + 音频
    - 返回 StoryboardComposeResult：{ status, video_url, audio_url, error? }
    """
    try:
        result = await compose_storyboard_video(
            db, project_id, current_user, req
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception(
            "[API] 故事板视频合成失败 project=%s", project_id
        )
        raise HTTPException(
            status_code=500, detail=f"故事板合成失败: {e}"
        ) from e
    return result.model_dump()


# ---------- 参考图上传 ----------

@router.post("/api/canvas/upload", summary="上传画布参考图")
async def upload_reference_api(
    file: UploadFile = File(..., description="参考图文件"),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """上传参考图到 outputs/upload/，返回可访问 URL。

    返回：{ url, upload_id, filename, file_size }
    """
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"不支持的图片格式：{file.content_type}，"
                f"仅支持 jpeg/png/webp/gif"
            ),
        )
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="上传文件为空")
    try:
        url, _file_path, filename, file_size = save_uploaded_file(
            file_bytes,
            file.content_type or "image/jpeg",
            file.filename or "reference.jpg",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "url": url,
        "upload_id": filename,
        "filename": filename,
        "file_size": file_size,
    }


@router.get("/api/canvas/health", summary="画布模块健康检查")
def health(_current_user: User = Depends(get_current_user)) -> dict[str, str]:
    """画布模块健康检查（需登录）。"""
    return {"status": "ok", "module": "canvas"}
