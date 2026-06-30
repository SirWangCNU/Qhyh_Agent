"""工坊会话 Pydantic 模型。

state 字段用 dict[str, Any] 透传前端 workshop-store 快照，后端不感知具体字段
（与 canvas nodes/edges 的 list[dict[str, Any]] 模式一致）。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class WorkshopSessionCreate(BaseModel):
    """创建工坊会话请求。"""

    name: str = Field(..., min_length=1, max_length=128, description="会话名称")
    state: dict[str, Any] = Field(
        default_factory=dict,
        description="工坊状态快照（workshop-store persist 的 snapshot）",
    )


class WorkshopSessionUpdate(BaseModel):
    """更新工坊会话请求（自动保存）。全部字段可选。"""

    name: str | None = Field(None, min_length=1, max_length=128)
    state: dict[str, Any] | None = None


class WorkshopSession(BaseModel):
    """工坊会话完整响应。"""

    id: str
    name: str
    state: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    class ConfigDict:
        from_attributes = True


class WorkshopSessionSummary(BaseModel):
    """工坊会话列表项（不含 state，节省带宽）。"""

    id: str
    name: str
    step_progress: str = "0/0"
    updated_at: datetime

    class ConfigDict:
        from_attributes = True
