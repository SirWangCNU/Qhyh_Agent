"""对话创作会话 ORM 模型与持久化查询函数。

采用关系型两表设计：
- conversations: 会话元信息（标题、迭代数、消息数、时间戳）
- conversation_messages: 消息明细（role/type/content/meta_json/seq）

通过 (conversation_id, seq) 复合索引支持消息分页与排序；
conversations 通过 (user_id, updated_at) 索引支持用户列表查询。
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Session

from src.db.database import Base

logger = logging.getLogger(__name__)


class ConversationORM(Base):
    """对话会话 ORM 模型。"""
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    summary = Column(String(500), nullable=True)
    iterations = Column(Integer, nullable=False, default=0)
    message_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )


class ConversationMessageORM(Base):
    """对话消息 ORM 模型。"""
    __tablename__ = "conversation_messages"

    id = Column(String(36), primary_key=True)
    conversation_id = Column(
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    seq = Column(Integer, nullable=False)
    role = Column(String(16), nullable=False)
    type = Column(String(16), nullable=False, default="text")
    content = Column(Text, nullable=False, default="")
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


# ---------- 序列化辅助 ----------

def _to_json(value: Any) -> str | None:
    """安全 JSON 序列化，None 透传。"""
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _from_json(value: str | None, default: Any) -> Any:
    """安全 JSON 反序列化。"""
    if not value:
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def _default_title(first_message: str | None) -> str:
    """根据首条用户消息生成默认标题。"""
    if not first_message:
        return "新对话"
    text = first_message.strip().replace("\n", " ")
    return text[:30] + ("…" if len(text) > 30 else "")


# ---------- CRUD ----------

def create_conversation(
    db: Session,
    user_id: int,
    *,
    title: str | None = None,
    first_message: str | None = None,
) -> ConversationORM:
    """创建对话会话。title 为空时用 first_message 前 30 字生成。"""
    final_title = title or _default_title(first_message)
    conv = ConversationORM(
        id=uuid.uuid4().hex,
        user_id=user_id,
        title=final_title,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    logger.info(
        "[conversation] 创建会话 id=%s user_id=%s title=%s",
        conv.id, user_id, final_title,
    )
    return conv


def list_conversations(
    db: Session,
    user_id: int,
    *,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """分页列出用户对话会话（按更新时间倒序）。返回 (items, total)。"""
    q = (
        db.query(ConversationORM)
        .filter(ConversationORM.user_id == user_id)
        .order_by(ConversationORM.updated_at.desc())
    )
    total = q.count()
    offset = (max(page, 1) - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()
    items = [_conv_summary(row) for row in rows]
    return items, total


def get_conversation(
    db: Session,
    conversation_id: str,
    user_id: int,
) -> ConversationORM | None:
    """获取单个会话（带归属校验）。"""
    return (
        db.query(ConversationORM)
        .filter(
            ConversationORM.id == conversation_id,
            ConversationORM.user_id == user_id,
        )
        .first()
    )


def get_conversation_detail(
    db: Session,
    conversation_id: str,
    user_id: int,
) -> dict[str, Any] | None:
    """获取会话详情（含全部消息，按 seq 升序）。"""
    conv = get_conversation(db, conversation_id, user_id)
    if conv is None:
        return None
    msgs = (
        db.query(ConversationMessageORM)
        .filter(ConversationMessageORM.conversation_id == conversation_id)
        .order_by(ConversationMessageORM.seq.asc())
        .all()
    )
    return {
        "id": conv.id,
        "title": conv.title,
        "summary": conv.summary,
        "iterations": conv.iterations,
        "message_count": conv.message_count,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
        "messages": [_msg_dict(m) for m in msgs],
    }


def rename_conversation(
    db: Session,
    conversation_id: str,
    user_id: int,
    *,
    title: str,
) -> ConversationORM | None:
    """重命名会话。返回 None 表示不存在或无归属。"""
    conv = get_conversation(db, conversation_id, user_id)
    if conv is None:
        return None
    conv.title = title[:200]
    conv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(conv)
    return conv


def append_message(
    db: Session,
    conversation_id: str,
    user_id: int,
    *,
    role: str,
    msg_type: str = "text",
    content: str = "",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """向会话追加一条消息，并更新 message_count / updated_at。

    返回新消息的 dict；返回 None 表示会话不存在或无归属。
    """
    conv = get_conversation(db, conversation_id, user_id)
    if conv is None:
        return None

    # 计算下一个 seq
    max_seq = (
        db.query(func.max(ConversationMessageORM.seq))
        .filter(ConversationMessageORM.conversation_id == conversation_id)
        .scalar()
    ) or 0
    next_seq = max_seq + 1

    msg = ConversationMessageORM(
        id=uuid.uuid4().hex,
        conversation_id=conversation_id,
        seq=next_seq,
        role=role,
        type=msg_type,
        content=content,
        meta_json=_to_json(meta),
    )
    db.add(msg)

    # 更新会话冗余字段
    conv.message_count = (conv.message_count or 0) + 1
    conv.updated_at = datetime.now(timezone.utc)
    # 若是首条 user 消息且标题仍为默认，更新标题
    if role == "user" and conv.title in ("", "新对话") and content.strip():
        conv.title = _default_title(content)
    db.commit()
    db.refresh(msg)
    return _msg_dict(msg)


def update_iterations(
    db: Session,
    conversation_id: str,
    user_id: int,
    *,
    iterations: int,
) -> bool:
    """更新会话的 ReAct 总迭代数（done 事件后调用）。"""
    conv = get_conversation(db, conversation_id, user_id)
    if conv is None:
        return False
    conv.iterations = iterations
    conv.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True


def delete_conversation(db: Session, conversation_id: str, user_id: int) -> bool:
    """删除会话（CASCADE 删消息）。返回 False 表示不存在或无归属。"""
    conv = get_conversation(db, conversation_id, user_id)
    if conv is None:
        return False
    db.delete(conv)
    db.commit()
    logger.info("[conversation] 删除会话 id=%s user_id=%s", conversation_id, user_id)
    return True


# ---------- dict 转换 ----------

def _conv_summary(row: ConversationORM) -> dict[str, Any]:
    """会话列表项 dict。"""
    return {
        "id": row.id,
        "title": row.title,
        "summary": row.summary,
        "iterations": row.iterations,
        "message_count": row.message_count,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _msg_dict(row: ConversationMessageORM) -> dict[str, Any]:
    """消息 dict。"""
    return {
        "id": row.id,
        "conversation_id": row.conversation_id,
        "seq": row.seq,
        "role": row.role,
        "type": row.type,
        "content": row.content,
        "meta_json": _from_json(row.meta_json, None),
        "created_at": row.created_at,
    }


def conv_summary_dict(row: ConversationORM) -> dict[str, Any]:
    """对外暴露的会话摘要转换（供 router 使用）。"""
    return _conv_summary(row)
