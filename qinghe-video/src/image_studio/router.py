"""图像处理工作室 FastAPI 路由。

POST /api/image-studio/generate：上传参考图 + 主题 → 9 变体 prompt → 并发图生图 → 九宫格拼接。
所有端点用 Depends(get_current_user) 鉴权，前端 auth.js 全局 fetch 拦截器自动注入 token。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pathlib import Path
from sqlalchemy.orm import Session

from src.assets import record_asset, url_to_local_path
from src.auth.dependencies import get_current_user
from src.db.database import get_db
from src.db.models import User
from src.image_studio.grid_composer import compose_grid
from src.image_studio.image_variants import encode_upload_to_b64, generate_variants
from src.image_studio.prompt_builder import build_variant_prompts

logger = logging.getLogger(__name__)

router = APIRouter(tags=["image-studio"])

# 允许的参考图 MIME 类型
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@router.post("/api/image-studio/generate", summary="生成九宫格导演板")
async def generate_director_board(
    image_type: str = Form(..., description="参考图类型：person 或 product"),
    subject: str = Form(..., description="创作主题描述"),
    style_preference: str | None = Form(None, description="可选风格偏好"),
    size: str | None = Form(None, description="单图尺寸，如 1024x1024"),
    reference_image: UploadFile = File(..., description="参考图文件"),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """完整流程：上传图 → LLM 生成 9 变体 prompt → 并发图生图 → 拼九宫格 → 返回。"""
    # 1. 参数校验
    if image_type not in ("person", "product"):
        raise HTTPException(status_code=400, detail="image_type 必须为 person 或 product")
    if not subject.strip():
        raise HTTPException(status_code=400, detail="subject 不能为空")
    if reference_image.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片格式：{reference_image.content_type}，仅支持 jpeg/png/webp",
        )

    logger.info(
        "[API] 图像工作室请求: image_type=%s, subject=%s, file=%s",
        image_type,
        subject,
        reference_image.filename,
    )

    try:
        # 2. 读取上传图 → base64
        file_bytes = await reference_image.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="上传文件为空")
        ref_b64 = encode_upload_to_b64(file_bytes, reference_image.content_type or "image/jpeg")

        # 3. LLM 生成 9 变体 prompt
        director_board = build_variant_prompts(image_type, subject, style_preference)

        # 4. 并发图生图（带参考图，保证人物/物品一致性）
        image_results = await generate_variants(
            director_board.variants, ref_b64, size
        )

        # 5. 拼九宫格
        grid_url = compose_grid(image_results)

        # 自动收集：九宫格主图落库到资产表（meta 存各变体 URL，失败仅记日志）
        try:
            variant_urls = [v.url for v in image_results if getattr(v, "url", None)]
            record_asset(
                db,
                _current_user.id,
                source="image_studio",
                media_type="image",
                url=grid_url,
                file_path=url_to_local_path(grid_url),
                filename=Path(grid_url).name if grid_url else None,
                title=director_board.subject,
                meta={
                    "variants": variant_urls,
                    "image_type": director_board.image_type,
                    "consistency_key": director_board.consistency_key,
                },
            )
        except Exception:
            logger.warning("[assets] 图像工作室资产落库失败 url=%s", grid_url, exc_info=True)

        # 6. 返回结果
        return {
            "status": "success",
            "grid_url": grid_url,
            "consistency_key": director_board.consistency_key,
            "subject": director_board.subject,
            "image_type": director_board.image_type,
            "variants": [v.model_dump() for v in image_results],
        }

    except HTTPException:
        raise
    except ValueError as e:
        logger.exception("[API] 图像工作室参数错误")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("[API] 图像工作室生成失败")
        raise HTTPException(status_code=500, detail=f"九宫格导演板生成失败: {e}") from e


@router.get("/api/image-studio/health", summary="图像工作室健康检查")
def health(_current_user: User = Depends(get_current_user)) -> dict[str, str]:
    """图像工作室模块健康检查（需登录）。"""
    return {"status": "ok", "module": "image-studio"}
