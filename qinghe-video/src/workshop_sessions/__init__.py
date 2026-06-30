"""工坊会话持久化模块。

刻意不在 __init__ 中导入 router，避免 alembic env 加载时触发 FastAPI 依赖链
（与 src/canvas/__init__.py 一致）。路由由 src/main.py 显式导入注册。
"""
