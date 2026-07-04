"""工坊会话 ORM 模型与持久化查询函数。

整体 JSON 序列化存一列（state_json），与 canvas_projects 的 nodes_json/edges_json
模式一致：单用户百会话级别查询性能足够，且对前端状态结构变化零侵入。

state_json 存储的 schema 即前端 workshop-store 的 persist 快照：
    {
      "steps": {"planner": "done", ...},
      "stepOutputs": {...},
      "stepErrors": {...},
      "workshopState": {...GenerateResult},
      "mediaResults": {"characterImage": ..., "objectImage": ..., "sceneImage": ...},
      "autoRunToStep": 4,
      "currentStep": "planner",
      "form": {...UserInput},
      "oneLiner": "...",
      "topics": [...],
      "selectedTopicIndex": null,
      "selectedTopic": null,
    }
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Session

from src.db.database import Base

logger = logging.getLogger(__name__)


class WorkshopSessionORM(Base):
    """工坊会话 ORM 模型。"""
    __tablename__ = "workshop_sessions"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    state_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )


# ---------- 序列化辅助 ----------

def _to_json(value: Any) -> str:
    """安全 JSON 序列化。"""
    return json.dumps(value, ensure_ascii=False, default=str)


def _from_json(value: str | None, default: Any) -> Any:
    """安全 JSON 反序列化。"""
    if not value:
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def _orm_to_dict(row: WorkshopSessionORM) -> dict[str, Any]:
    """ORM 行转 dict（供 Pydantic 模型构造）。"""
    return {
        "id": row.id,
        "name": row.name,
        "state": _from_json(row.state_json, {}),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _extract_step_progress(state: dict[str, Any]) -> str:
    """从 state 中提取步骤进度摘要，如 '2/4'。

    steps 形如 {"planner": "done", "copywriter": "done", "consistency_images": "pending", ...}。
    """
    steps = state.get("steps")
    if not isinstance(steps, dict) or not steps:
        return "0/0"
    done = sum(1 for v in steps.values() if v == "done")
    total = len(steps)
    return f"{done}/{total}"


# ---------- CRUD ----------

def create_session(
    db: Session,
    user_id: int,
    *,
    name: str,
    state: dict[str, Any] | None = None,
) -> WorkshopSessionORM:
    """创建工坊会话。"""
    session = WorkshopSessionORM(
        id=uuid.uuid4().hex,
        user_id=user_id,
        name=name,
        state_json=_to_json(state or {}),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info(
        "[workshop] 创建会话 id=%s user_id=%s name=%s", session.id, user_id, name
    )
    return session


def list_sessions(db: Session, user_id: int) -> list[dict[str, Any]]:
    """列出用户所有工坊会话（summary，按更新时间倒序）。"""
    rows = (
        db.query(WorkshopSessionORM)
        .filter(WorkshopSessionORM.user_id == user_id)
        .order_by(WorkshopSessionORM.updated_at.desc())
        .all()
    )
    result: list[dict[str, Any]] = []
    for row in rows:
        state = _from_json(row.state_json, {})
        result.append(
            {
                "id": row.id,
                "name": row.name,
                "step_progress": _extract_step_progress(state),
                "updated_at": row.updated_at,
            }
        )
    return result


def get_session(
    db: Session, session_id: str, user_id: int
) -> WorkshopSessionORM | None:
    """获取单个会话（带归属校验）。"""
    return (
        db.query(WorkshopSessionORM)
        .filter(
            WorkshopSessionORM.id == session_id,
            WorkshopSessionORM.user_id == user_id,
        )
        .first()
    )


def update_session(
    db: Session,
    session_id: str,
    user_id: int,
    *,
    name: str | None = None,
    state: dict[str, Any] | None = None,
) -> WorkshopSessionORM | None:
    """更新会话字段（仅非 None 字段）。返回 None 表示会话不存在或无归属。"""
    session = get_session(db, session_id, user_id)
    if session is None:
        return None
    if name is not None:
        session.name = name
    if state is not None:
        session.state_json = _to_json(state)
    session.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: Session, session_id: str, user_id: int) -> bool:
    """删除会话。返回 False 表示不存在或无归属。"""
    session = get_session(db, session_id, user_id)
    if session is None:
        return False
    db.delete(session)
    db.commit()
    logger.info("[workshop] 删除会话 id=%s user_id=%s", session_id, user_id)
    return True


def to_response_dict(row: WorkshopSessionORM) -> dict[str, Any]:
    """ORM 转 API 响应 dict。"""
    return _orm_to_dict(row)
