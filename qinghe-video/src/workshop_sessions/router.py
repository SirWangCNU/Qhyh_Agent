"""工坊会话 FastAPI 路由。

端点（全部走 Depends(get_current_user) 鉴权）：
- POST   /api/workshop/sessions              创建工坊会话
- GET    /api/workshop/sessions              列出当前用户会话
- GET    /api/workshop/sessions/{id}         获取完整会话
- PUT    /api/workshop/sessions/{id}         更新会话（自动保存）
- DELETE /api/workshop/sessions/{id}         删除会话

所有查询按 user_id 行级隔离（用户只能看到/操作自己的会话），与 canvas/assets 一致。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.auth.dependencies import get_current_user
from src.db.database import get_db
from src.db.models import User
from src.workshop_sessions.models import (
    WorkshopSessionCreate,
    WorkshopSessionUpdate,
)
from src.workshop_sessions.persistence import (
    create_session,
    delete_session,
    get_session,
    list_sessions,
    to_response_dict,
    update_session,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["workshop-sessions"])


# ---------- 会话 CRUD ----------

@router.post("/api/workshop/sessions", summary="创建工坊会话")
def create_session_api(
    req: WorkshopSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """创建一个工坊会话（可携带初始 state 快照）。"""
    session = create_session(
        db,
        current_user.id,
        name=req.name,
        state=req.state,
    )
    return to_response_dict(session)


@router.get("/api/workshop/sessions", summary="列出工坊会话")
def list_sessions_api(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """列出当前用户所有工坊会话（按更新时间倒序，含 step_progress 摘要）。"""
    return list_sessions(db, current_user.id)


@router.get("/api/workshop/sessions/{session_id}", summary="获取工坊会话")
def get_session_api(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """获取完整工坊会话（含 state 快照）。"""
    session = get_session(db, session_id, current_user.id)
    if session is None:
        raise HTTPException(status_code=404, detail="工坊会话不存在")
    return to_response_dict(session)


@router.put("/api/workshop/sessions/{session_id}", summary="更新工坊会话")
def update_session_api(
    session_id: str,
    req: WorkshopSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """更新工坊会话（前端 debounce 2s 自动保存触发）。"""
    session = update_session(
        db,
        session_id,
        current_user.id,
        name=req.name,
        state=req.state,
    )
    if session is None:
        raise HTTPException(status_code=404, detail="工坊会话不存在")
    return to_response_dict(session)


@router.delete("/api/workshop/sessions/{session_id}", summary="删除工坊会话")
def delete_session_api(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """删除工坊会话。"""
    ok = delete_session(db, session_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="工坊会话不存在")
    return {"status": "deleted"}
