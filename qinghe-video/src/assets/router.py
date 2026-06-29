"""「我的资产」FastAPI 路由。

提供资产的增删查 + 手动上传 + 来源统计接口。所有端点均需登录。

端点：
- GET    /api/assets               分页列表（支持 source / media_type 筛选）
- GET    /api/assets/stats         按来源模块聚合统计
- GET    /api/assets/{asset_id}   单条详情
- POST   /api/assets/upload        手动上传文件入库
- DELETE /api/assets/{asset_id}    删除资产（级联删物理文件）
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from src.assets.models import (
    AssetDeleteResponse,
    AssetListResponse,
    AssetResponse,
    AssetStats,
)
from src.assets.service import (
    delete_asset,
    get_asset,
    get_stats,
    list_assets,
    record_asset,
    save_uploaded_file,
    _parse_meta,
)
from src.auth.dependencies import get_current_user
from src.db.database import get_db
from src.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["assets"])


# ---------- 列表 ----------

@router.get("/api/assets", summary="查询我的资产列表", response_model=AssetListResponse)
def list_assets_endpoint(
    source: str | None = Query(None, description="按来源模块筛选：video_mvp/video_compose/tts/image_studio/consistency/image_gen/upload"),
    media_type: str | None = Query(None, description="按媒体类型筛选：image/video/audio"),
    page: int = Query(1, ge=1, description="页码（从 1 开始）"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量（1-100）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetListResponse:
    """分页查询当前用户的资产，按创建时间倒序，支持来源 + 类型双维度筛选。"""
    items, total = list_assets(
        db,
        current_user.id,
        source=source,
        media_type=media_type,
        page=page,
        page_size=page_size,
    )
    return AssetListResponse(
        items=[AssetResponse.model_validate(_to_response_dict(a)) for a in items],
        total=total,
        page=page,
        page_size=page_size,
        source_filter=source,
        media_type_filter=media_type,
    )


# ---------- 统计 ----------

@router.get("/api/assets/stats", summary="按来源模块统计资产", response_model=list[AssetStats])
def stats_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AssetStats]:
    """按来源模块聚合：每个 source 的资产数量与总大小。

    未知来源统一归入 'upload'，避免新增模块未同步枚举时统计接口 500。
    """
    rows = get_stats(db, current_user.id)
    merged: dict[str, dict[str, int]] = {}
    for r in rows:
        source = r["source"]
        if source not in _VALID_SOURCES:
            logger.warning("[assets] 统计中发现未知 source=%s，归入 upload", source)
            source = "upload"
        bucket = merged.setdefault(source, {"count": 0, "total_size": 0})
        bucket["count"] += int(r["count"])
        bucket["total_size"] += int(r["total_size"] or 0)

    return [
        AssetStats(source=source, count=bucket["count"], total_size=bucket["total_size"])
        for source, bucket in sorted(merged.items(), key=lambda x: x[1]["count"], reverse=True)
    ]


# ---------- 详情 ----------

@router.get("/api/assets/{asset_id}", summary="查询资产详情", response_model=AssetResponse)
def get_asset_endpoint(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetResponse:
    """查询单条资产详情（仅限本人资产）。"""
    asset = get_asset(db, asset_id, current_user.id)
    if asset is None:
        raise HTTPException(status_code=404, detail="资产不存在或无权访问")
    return AssetResponse.model_validate(_to_response_dict(asset))


# ---------- 上传 ----------

@router.post("/api/assets/upload", summary="手动上传资产", response_model=AssetResponse)
async def upload_asset_endpoint(
    file: UploadFile = File(..., description="待上传的图片/视频/音频文件"),
    title: str | None = Form(None, description="资产展示标题（可空）"),
    source: str = Form("upload", description="来源标记（默认 upload）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetResponse:
    """手动上传文件入库。MIME 白名单：jpeg/png/webp/gif/mp4/mp3。"""
    try:
        file_bytes = await file.read()
        url, file_path, filename, file_size = save_uploaded_file(
            file_bytes,
            file.content_type or "",
            file.filename or "unnamed",
        )
        asset = record_asset(
            db,
            current_user.id,
            source=source,
            media_type=None,
            url=url,
            file_path=file_path,
            filename=filename,
            file_size=file_size,
            mime_type=file.content_type,
            title=title,
        )
        return AssetResponse.model_validate(_to_response_dict(asset))
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("[API] 资产上传参数错误: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("[API] 资产上传失败")
        raise HTTPException(status_code=500, detail=f"资产上传失败: {e}") from e


# ---------- 删除 ----------

@router.delete("/api/assets/{asset_id}", summary="删除资产", response_model=AssetDeleteResponse)
def delete_asset_endpoint(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetDeleteResponse:
    """删除资产：级联删除物理文件（文件删除失败仅记日志，DB 行必删）。"""
    deleted = delete_asset(db, asset_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="资产不存在或无权访问")
    return AssetDeleteResponse(status="deleted", id=asset_id)


# 合法的来源枚举集合（与 models.AssetSource 保持一致）
_VALID_SOURCES = {
    "video_mvp",
    "video_compose",
    "tts",
    "image_studio",
    "consistency",
    "image_gen",
    "canvas",
    "upload",
}


# ---------- 辅助 ----------

def _to_response_dict(asset: Any) -> dict[str, Any]:
    """把 ORM Asset 对象转为可被 AssetResponse 校验的 dict（解析 meta_json）。

    若 DB 中 source 不在当前合法枚举内（例如新增模块未同步枚举），
    降级为 'upload' 并记警告，避免整个列表因单条脏数据 500。
    """
    source = asset.source
    if source not in _VALID_SOURCES:
        logger.warning(
            "[assets] 未知 source=%s，降级为 upload (asset_id=%s)",
            source,
            asset.id,
        )
        source = "upload"

    return {
        "id": asset.id,
        "user_id": asset.user_id,
        "source": source,
        "media_type": asset.media_type,
        "filename": asset.filename,
        "url": asset.url,
        "file_size": asset.file_size,
        "mime_type": asset.mime_type,
        "title": asset.title,
        "meta_json": _parse_meta(asset.meta_json),
        "created_at": asset.created_at,
    }
