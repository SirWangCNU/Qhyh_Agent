"""无限画布模块：自由画布 + 可选连线的多参考图创作工作台。

独立模块，不接入 LangGraph 流水线。提供：
- CanvasProject ORM + CRUD：画布项目持久化（nodes/edges/viewport 整体 JSON 存储）
- generate 编排：收集生成节点入边的参考图 + 提示词 → 调 image_generation → 回写结果
- canvas_router: FastAPI APIRouter

节点类型（前端 React Flow 自定义节点，后端透明存 JSON）：
- referenceImage: 参考图（refType: content/style/structure/pose）
- prompt: 文本提示词
- generate: 生成任务（status: idle/running/done/error）
- image: 纯图片（生成结果落盘 / 上传素材）

注意：本 __init__.py 刻意不导入 router，避免 alembic env.py 加载 ORM 时
触发 FastAPI 依赖链。需要路由时显式::

    from src.canvas.router import router as canvas_router

用法示例（其他脚本调用）::

    from src.canvas.persistence import create_project, get_project
    from src.canvas.service import run_generate
    from sqlalchemy.orm import Session
    from src.db.database import SessionLocal

    with SessionLocal() as db:
        project = create_project(db, user_id=1, name="我的画布")
"""
