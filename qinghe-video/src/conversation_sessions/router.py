"""对话创作会话 FastAPI 路由。

端点（全部走 Depends(get_current_user) 鉴权）：
- POST   /api/conversation-sessions                  创建会话
- GET    /api/conversation-sessions                  分页列出会话
- GET    /api/conversation-sessions/{id}             获取会话详情（含消息）
- PUT    /api/conversation-sessions/{id}             重命名会话
- POST   /api/conversation-sessions/{id}/messages    追加消息
- DELETE /api/conversation-sessions/{id}             删除会话

所有查询按 user_id 行级隔离（与 workshop_sessions / assets / canvas 一致）。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.auth.dependencies import get_current_user
from src.conversation_sessions.persistence import (
    append_message,
    conv_summary_dict,
    create_conversation,
    delete_conversation,
    get_conversation_detail,
    list_conversations,
    rename_conversation,
    update_iterations,
)
from src.conversation_sessions.schemas import (
    ConversationCreateRequest,
    ConversationListResponse,
    MessageCreateRequest,
    RenameRequest,
)
from src.db.database import get_db
from src.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["conversation-sessions"])


@router.post("/api/conversation-sessions", summary="创建对话会话")
def create_conversation_api(
    req: ConversationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """创建对话会话，可携带首条用户消息用于生成默认标题。"""
    conv = create_conversation(
        db,
        current_user.id,
        title=req.title,
        first_message=req.first_message,
    )
    return conv_summary_dict(conv)


@router.get("/api/conversation-sessions", summary="列出对话会话")
def list_conversations_api(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """分页列出当前用户的对话会话（按更新时间倒序）。"""
    items, total = list_conversations(db, current_user.id, page=page, page_size=page_size)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/api/conversation-sessions/{conversation_id}", summary="获取对话会话详情")
def get_conversation_api(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """获取会话详情（含全部消息，按 seq 升序）。"""
    detail = get_conversation_detail(db, conversation_id, current_user.id)
    if detail is None:
        raise HTTPException(status_code=404, detail="对话会话不存在")
    return detail


@router.put("/api/conversation-sessions/{conversation_id}", summary="重命名对话会话")
def rename_conversation_api(
    conversation_id: str,
    req: RenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """重命名会话。"""
    conv = rename_conversation(db, conversation_id, current_user.id, title=req.title)
    if conv is None:
        raise HTTPException(status_code=404, detail="对话会话不存在")
    return conv_summary_dict(conv)


@router.post(
    "/api/conversation-sessions/{conversation_id}/messages",
    summary="追加对话消息",
)
def append_message_api(
    conversation_id: str,
    req: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """向会话追加一条消息（user 或 assistant），并更新 message_count/updated_at。

    若请求携带 iterations（assistant 完成时），同步更新会话迭代数。
    """
    msg = append_message(
        db,
        conversation_id,
        current_user.id,
        role=req.role,
        msg_type=req.type,
        content=req.content,
        meta=req.meta_json,
    )
    if msg is None:
        raise HTTPException(status_code=404, detail="对话会话不存在")
    # 可选：更新迭代数
    if req.iterations is not None:
        update_iterations(
            db, conversation_id, current_user.id, iterations=req.iterations
        )
    return msg


@router.delete("/api/conversation-sessions/{conversation_id}", summary="删除对话会话")
def delete_conversation_api(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """删除对话会话（CASCADE 删除其全部消息）。"""
    ok = delete_conversation(db, conversation_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="对话会话不存在")
    return {"status": "deleted"}
