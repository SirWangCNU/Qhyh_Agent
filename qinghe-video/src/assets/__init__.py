"""「我的资产」模块：用户生成媒体资产的持久化管理。

独立模块，不接入 LangGraph 流水线。提供：
- record_asset: 落库单条资产（被现有生成端点调用实现「自动收集」）
- list_assets / get_asset / delete_asset / get_stats: 资产 CRUD 与统计
- save_uploaded_file: 用户手动上传文件保存
- assets_router: FastAPI APIRouter

用法示例（其他脚本调用）::

    from sqlalchemy.orm import Session
    from src.assets import record_asset, list_assets
    from src.db.database import SessionLocal

    with SessionLocal() as db:
        asset = record_asset(db, user_id=1, source="tts", media_type="audio",
                             url="/outputs/audio/x.mp3", file_path="/abs/x.mp3")
        items, total = list_assets(db, user_id=1, source="tts", page=1)
"""
from src.assets.router import router as assets_router
from src.assets.service import (
    delete_asset,
    get_asset,
    get_stats,
    list_assets,
    record_asset,
    save_uploaded_file,
    url_to_local_path,
)

__all__ = [
    "assets_router",
    "record_asset",
    "list_assets",
    "get_asset",
    "delete_asset",
    "get_stats",
    "save_uploaded_file",
    "url_to_local_path",
]
