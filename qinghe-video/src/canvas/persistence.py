"""画布项目 ORM 模型与持久化查询函数。

nodes/edges/viewport 整体 JSON 序列化存一列，符合 React Flow 序列化模型，
简单可靠，单用户百项目级别查询性能足够。
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


class CanvasProjectORM(Base):
    """画布项目 ORM 模型。"""
    __tablename__ = "canvas_projects"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    nodes_json = Column(Text, nullable=False, default="[]")
    edges_json = Column(Text, nullable=False, default="[]")
    viewport_json = Column(Text, nullable=True)
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


def _orm_to_dict(row: CanvasProjectORM) -> dict[str, Any]:
    """ORM 行转 dict（供 Pydantic 模型构造）。"""
    return {
        "id": row.id,
        "name": row.name,
        "nodes": _from_json(row.nodes_json, []),
        "edges": _from_json(row.edges_json, []),
        "viewport": _from_json(row.viewport_json, {}),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _extract_thumbnail(nodes: list[dict[str, Any]]) -> str | None:
    """从 nodes 中取首个已完成 generate 节点的结果图 URL 作缩略图。"""
    for node in nodes:
        if node.get("type") != "generate":
            continue
        data = node.get("data") or {}
        if data.get("status") == "done" and data.get("resultImageUrl"):
            return data["resultImageUrl"]
    return None


# ---------- CRUD ----------

def create_project(
    db: Session,
    user_id: int,
    *,
    name: str,
    nodes: list[dict[str, Any]] | None = None,
    edges: list[dict[str, Any]] | None = None,
    viewport: dict[str, Any] | None = None,
) -> CanvasProjectORM:
    """创建画布项目。"""
    project = CanvasProjectORM(
        id=uuid.uuid4().hex,
        user_id=user_id,
        name=name,
        nodes_json=_to_json(nodes or []),
        edges_json=_to_json(edges or []),
        viewport_json=_to_json(viewport or {}),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info("[canvas] 创建项目 id=%s user_id=%s name=%s", project.id, user_id, name)
    return project


def list_projects(db: Session, user_id: int) -> list[dict[str, Any]]:
    """列出用户所有项目（summary，按更新时间倒序）。"""
    rows = (
        db.query(CanvasProjectORM)
        .filter(CanvasProjectORM.user_id == user_id)
        .order_by(CanvasProjectORM.updated_at.desc())
        .all()
    )
    result: list[dict[str, Any]] = []
    for row in rows:
        nodes = _from_json(row.nodes_json, [])
        result.append({
            "id": row.id,
            "name": row.name,
            "thumbnail_url": _extract_thumbnail(nodes),
            "node_count": len(nodes),
            "updated_at": row.updated_at,
        })
    return result


def get_project(db: Session, project_id: str, user_id: int) -> CanvasProjectORM | None:
    """获取单个项目（带归属校验）。"""
    return (
        db.query(CanvasProjectORM)
        .filter(
            CanvasProjectORM.id == project_id,
            CanvasProjectORM.user_id == user_id,
        )
        .first()
    )


def update_project(
    db: Session,
    project_id: str,
    user_id: int,
    *,
    name: str | None = None,
    nodes: list[dict[str, Any]] | None = None,
    edges: list[dict[str, Any]] | None = None,
    viewport: dict[str, Any] | None = None,
) -> CanvasProjectORM | None:
    """更新项目字段（仅非 None 字段）。返回 None 表示项目不存在或无归属。"""
    project = get_project(db, project_id, user_id)
    if project is None:
        return None
    if name is not None:
        project.name = name
    if nodes is not None:
        project.nodes_json = _to_json(nodes)
    if edges is not None:
        project.edges_json = _to_json(edges)
    if viewport is not None:
        project.viewport_json = _to_json(viewport)
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: str, user_id: int) -> bool:
    """删除项目。返回 False 表示不存在或无归属。"""
    project = get_project(db, project_id, user_id)
    if project is None:
        return False
    db.delete(project)
    db.commit()
    logger.info("[canvas] 删除项目 id=%s user_id=%s", project_id, user_id)
    return True


def update_node_data(
    db: Session,
    project_id: str,
    user_id: int,
    node_id: str,
    data_patch: dict[str, Any],
) -> dict[str, Any] | None:
    """局部更新单个节点的 data 字段（合并），用于生成完成后回写结果。

    返回更新后的完整 project dict，None 表示项目不存在或无归属。
    """
    project = get_project(db, project_id, user_id)
    if project is None:
        return None
    nodes: list[dict[str, Any]] = _from_json(project.nodes_json, [])
    for node in nodes:
        if node.get("id") == node_id:
            node_data = node.get("data") or {}
            node_data.update(data_patch)
            node["data"] = node_data
            break
    else:
        logger.warning("[canvas] 未找到节点 node_id=%s project=%s", node_id, project_id)
        return None
    project.nodes_json = _to_json(nodes)
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return _orm_to_dict(project)


def to_response_dict(row: CanvasProjectORM) -> dict[str, Any]:
    """ORM 转 API 响应 dict。"""
    return _orm_to_dict(row)
