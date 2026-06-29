"""「我的资产」模块 Pydantic 业务模型。

字段名与 ORM ``Asset`` 及 JSON 响应键严格对齐（snake_case）。
所有业务输出模型用 ``extra="forbid"`` 防御多余字段；
``AssetResponse`` 额外启用 ``from_attributes`` 以便直接从 ORM 对象序列化。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


# 来源模块（与各生成端点一一对应；upload = 用户手动上传）
AssetSource = Literal[
    "video_mvp",
    "video_compose",
    "tts",
    "image_studio",
    "consistency",
    "image_gen",
    "canvas",
    "upload",
]

# 媒体类型
MediaType = Literal["image", "video", "audio"]


class AssetResponse(BaseModel):
    """单条资产的对外响应模型（可由 ORM 对象直接构造）。"""
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    user_id: int
    source: AssetSource
    media_type: MediaType
    filename: str
    url: str
    file_size: int | None = None
    mime_type: str | None = None
    title: str | None = None
    meta_json: dict[str, Any] | None = None
    created_at: datetime


class AssetListResponse(BaseModel):
    """资产列表分页响应。"""
    model_config = ConfigDict(extra="forbid")

    items: list[AssetResponse]
    total: int
    page: int
    page_size: int
    source_filter: str | None = None
    media_type_filter: str | None = None


class AssetStats(BaseModel):
    """按来源模块聚合的统计项。"""
    model_config = ConfigDict(extra="forbid")

    source: AssetSource
    count: int
    total_size: int


class AssetDeleteResponse(BaseModel):
    """删除资产响应。"""
    model_config = ConfigDict(extra="forbid")

    status: str
    id: int
