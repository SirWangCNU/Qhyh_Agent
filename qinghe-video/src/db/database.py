"""SQLite 数据库引擎与会话工厂。"""
from pathlib import Path
from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from src.config import settings, PROJECT_ROOT

SQLITE_URL = f"sqlite:///{(PROJECT_ROOT / settings.SQLITE_PATH).resolve()}"

@lru_cache(maxsize=1)
def get_engine():
    """获取数据库引擎单例。"""
    return create_engine(SQLITE_URL, echo=False, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=get_engine(), autocommit=False, autoflush=False)
Base = declarative_base()

def get_db():
    """FastAPI 依赖：每个请求注入一个 DB 会话，请求结束自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
