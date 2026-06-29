"""「我的资产」核心服务函数：纯数据库 + 文件系统操作，不依赖 FastAPI。

所有函数都可被其他脚本直接 import 调用（满足模块化约束）。

提供：
- record_asset: 落库单条资产（被现有生成端点调用实现「自动收集」）
- list_assets: 分页 + 来源/类型筛选查询
- get_asset: 单条查询（带归属校验）
- delete_asset: 删除资产并清理物理文件
- get_stats: 按来源模块聚合统计
- save_uploaded_file: 保存用户手动上传的文件到 outputs/upload/
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from src.config import PROJECT_ROOT
from src.db.models import Asset

logger = logging.getLogger(__name__)

# ---------- 常量 ----------

# 上传文件保存目录（与 outputs/audio、outputs/video 并列）
UPLOAD_DIR = PROJECT_ROOT / "outputs" / "upload"

# 允许的上传 MIME 白名单
_ALLOWED_MIME: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
}

# 扩展名 → media_type 推断表
_EXT_TO_MEDIA_TYPE: dict[str, str] = {
    ".jpg": "image", ".jpeg": "image", ".png": "image",
    ".webp": "image", ".gif": "image",
    ".mp4": "video", ".mov": "video", ".webm": "video",
    ".mp3": "audio", ".wav": "audio", ".m4a": "audio",
}

# 默认分页
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


# ---------- 辅助 ----------

def _infer_media_type(url_or_filename: str) -> str:
    """根据 URL/文件名扩展名推断 media_type。未知扩展名默认 image。"""
    suffix = Path(url_or_filename).suffix.lower()
    return _EXT_TO_MEDIA_TYPE.get(suffix, "image")


def _parse_meta(meta_json: str | None) -> dict[str, Any] | None:
    """把 DB 里的 meta_json 字符串解析回 dict（解析失败返回 None）。"""
    if not meta_json:
        return None
    try:
        return json.loads(meta_json)
    except (ValueError, TypeError):
        return None


# ---------- 核心服务函数 ----------

def record_asset(
    db: Session,
    user_id: int,
    *,
    source: str,
    media_type: str | None,
    url: str,
    file_path: str,
    filename: str | None = None,
    file_size: int | None = None,
    mime_type: str | None = None,
    title: str | None = None,
    meta: dict[str, Any] | None = None,
    commit: bool = True,
) -> Asset:
    """落库一条资产记录。

    被 6 个生成端点（tts / video_compose / video_mvp / image_studio /
    consistency / image_gen）以及手动上传端点共用，是「自动收集」的关键入口。

    - media_type / filename 未传时自动从 url 推断。
    - meta 字典序列化为 JSON 字符串存入 meta_json 列。
    - commit=False 时不提交（用于事务批量场景），由调用方统一提交。
    """
    if media_type is None:
        media_type = _infer_media_type(url)
    if filename is None:
        filename = Path(url).name
    try:
        file_size_val = file_size if file_size is not None else _safe_file_size(file_path)
    except OSError:
        file_size_val = None

    asset = Asset(
        user_id=user_id,
        source=source,
        media_type=media_type,
        filename=filename,
        url=url,
        file_path=file_path,
        file_size=file_size_val,
        mime_type=mime_type,
        title=title,
        meta_json=json.dumps(meta, ensure_ascii=False) if meta else None,
    )
    db.add(asset)
    if commit:
        db.commit()
        db.refresh(asset)
    else:
        db.flush()
    logger.info(
        "[assets] 落库成功 user_id=%s source=%s media_type=%s url=%s",
        user_id, source, media_type, url,
    )
    return asset


def list_assets(
    db: Session,
    user_id: int,
    *,
    source: str | None = None,
    media_type: str | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> tuple[list[Asset], int]:
    """分页查询当前用户的资产，按创建时间倒序。

    返回 (items, total)。user_id 隔离：用户只能看到自己的资产。
    """
    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    stmt = select(Asset).where(Asset.user_id == user_id)
    if source:
        stmt = stmt.where(Asset.source == source)
    if media_type:
        stmt = stmt.where(Asset.media_type == media_type)

    # 总数
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int(db.execute(count_stmt).scalar() or 0)

    # 分页
    stmt = stmt.order_by(desc(Asset.created_at)).offset((page - 1) * page_size).limit(page_size)
    items = list(db.execute(stmt).scalars().all())
    return items, total


def get_asset(db: Session, asset_id: int, user_id: int) -> Asset | None:
    """查询单条资产，带归属校验（不属于该用户则返回 None）。"""
    stmt = select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    return db.execute(stmt).scalars().first()


def delete_asset(db: Session, asset_id: int, user_id: int) -> bool:
    """删除资产：先校验归属 → 删物理文件 → 删 DB 行。

    物理文件删除失败仅记 warning，不阻断响应（避免悬空 DB 记录无法清除）。
    返回 True 表示 DB 行已删除。
    """
    asset = get_asset(db, asset_id, user_id)
    if asset is None:
        return False

    # 删物理文件
    try:
        Path(asset.file_path).unlink(missing_ok=True)
    except OSError as e:
        logger.warning("[assets] 删除物理文件失败 path=%s err=%s", asset.file_path, e)

    # 删 DB 行
    db.delete(asset)
    db.commit()
    logger.info(
        "[assets] 删除成功 asset_id=%s user_id=%s source=%s",
        asset_id, user_id, asset.source,
    )
    return True


def get_stats(db: Session, user_id: int) -> list[dict[str, Any]]:
    """按来源模块聚合统计：count + total_size。

    返回 [{source, count, total_size}, ...]，按 count 倒序。
    """
    stmt = (
        select(
            Asset.source,
            func.count(Asset.id).label("count"),
            func.coalesce(func.sum(Asset.file_size), 0).label("total_size"),
        )
        .where(Asset.user_id == user_id)
        .group_by(Asset.source)
        .order_by(desc(func.count(Asset.id)))
    )
    rows = db.execute(stmt).all()
    return [
        {"source": row.source, "count": int(row.count), "total_size": int(row.total_size or 0)}
        for row in rows
    ]


def save_uploaded_file(
    file_bytes: bytes,
    content_type: str,
    original_name: str,
) -> tuple[str, str, str, int]:
    """保存用户手动上传的文件到 outputs/upload/ 目录。

    返回 (url, file_path, filename, file_size)。
    - MIME 白名单校验：非法类型抛 ValueError。
    - 时间戳命名防冲突，保留原扩展名。
    """
    if not file_bytes:
        raise ValueError("上传文件为空")

    ct = (content_type or "").lower()
    if ct not in _ALLOWED_MIME:
        raise ValueError(
            f"不支持的文件类型：{content_type or '未知'}，"
            f"仅支持 jpeg/png/webp/gif/mp4/mp3"
        )

    ext = _ALLOWED_MIME[ct]
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = int(time.time() * 1000)
    filename = f"upload_{timestamp}.{ext}"
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(file_bytes)
    file_size = len(file_bytes)
    url = f"/outputs/upload/{filename}"
    logger.info(
        "[assets] 上传文件已保存 original=%s → %s size=%s",
        original_name, url, file_size,
    )
    return url, str(file_path), filename, file_size


def _safe_file_size(file_path: str) -> int | None:
    """安全读取文件大小（文件不存在返回 None）。"""
    p = Path(file_path)
    if p.exists() and p.is_file():
        return p.stat().st_size
    return None


def url_to_local_path(url: str) -> str:
    """把 /outputs/... 相对 URL 转为服务端绝对路径；非 outputs URL 原样返回（外部资源占位）。

    公共工具：被 main.py 各生成端点及 image_studio / consistency_images 路由共用，
    保证 record_asset 的 file_path 字段为绝对路径（删除资产时能定位到物理文件）。
    """
    if url.startswith("/outputs/"):
        return str(PROJECT_ROOT / url.lstrip("/"))
    return url
