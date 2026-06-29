"""人物/物品/场景一致性生图模块。

独立模块，不接入 LangGraph 流水线。提供：
- build_prompt: 按 image_type 读取固定布局模板，str.replace 填占位符
- generate_consistency_image: 单次调 doubao-seedream（图生图或纯文生图）
- consistency_images_router: FastAPI APIRouter

三类布局：
- character: 角色设定集（左大图 + 中间三列全身 + 右侧 2×3 六宫格）
- object:    3×3 九宫格（6 方向视图 + 3 细节/场景图）
- scene:     2×2 四面环视图（正/背/左/右）
"""

from src.consistency_images.router import router as consistency_images_router

__all__ = ["consistency_images_router"]
