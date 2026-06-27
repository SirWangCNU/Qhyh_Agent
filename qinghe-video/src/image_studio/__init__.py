"""图像处理工作室：九宫格导演板图生成。

独立模块，不接入 LangGraph 流水线。提供：
- build_variant_prompts: LLM 生成 9 风格变体英文 prompt
- generate_variants: 并发调用 doubao-seedream 图生图（带参考图）
- compose_grid: Pillow 拼接 3×3 九宫格
- image_studio_router: FastAPI APIRouter

后续接入流水线时，可在 agent_steps.py 加 image_studio 步骤，
或从 visual_output.shot_prompts 取镜头调用 generate_variants()。
"""

from src.image_studio.router import router as image_studio_router

__all__ = ["image_studio_router"]
