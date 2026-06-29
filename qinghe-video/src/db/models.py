"""用户表与资产表 ORM 模型。"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from src.db.database import Base


class User(Base):
    """用户模型。"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(16), default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Asset(Base):
    """用户资产模型：图片 / 视频 / 音频，按来源模块分类持久化。

    source 记录资产来源（video_mvp / video_compose / tts / image_studio /
    consistency / image_gen / upload），media_type 记录文件类型
    （image / video / audio），二者正交。
    """
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source = Column(String(32), nullable=False, index=True)
    media_type = Column(String(16), nullable=False)
    filename = Column(String(255), nullable=False)
    url = Column(String(512), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(128), nullable=True)
    title = Column(String(255), nullable=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
