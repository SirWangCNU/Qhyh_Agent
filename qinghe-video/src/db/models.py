"""用户表 ORM 模型。"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
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
