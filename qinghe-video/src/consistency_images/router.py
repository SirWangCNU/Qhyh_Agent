"""一致性生图 FastAPI 路由。

POST /api/consistency-images/generate
    multipart/form-data，参考图可选。
    有参考图 → 图生图；无参考图 → 纯文生图。
    返回单张合成大图 URL。

GET /api/consistency-images/health
    健康检查（需登录）。

所有端点 Depends(get_current_user) 鉴权。
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pathlib import Path
from sqlalchemy.orm import Session

from src.assets import record_asset, url_to_local_path
from src.auth.dependencies import get_current_user
from src.consistency_images.image_generator import generate_consistency_image
from src.consistency_images.prompt_builder import build_prompt
from src.db.database import get_db
from src.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["consistency-images"])

# 允许的参考图 MIME 类型（与 image_studio/router.py 一致）
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


@router.post("/api/consistency-images/generate", summary="生成人物/物品/场景一致性参考图")
async def generate(
    image_type: str = Form(..., description="参考图类型：character/object/scene"),
    subject: str = Form(..., description="主体描述"),
    style_preference: str | None = Form(None, description="可选风格偏好"),
    size: str | None = Form(None, description="图像尺寸，如 1920x1920"),
    negative_prompt: str | None = Form(None, description="可选负向提示词"),
    reference_image: UploadFile | None = File(None, description="可选参考图"),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """单次生成单张合成大图：人物设定集 / 物品九宫格 / 场景四面环视图。"""
    # 1. 参数校验
    if image_type not in ("character", "object", "scene"):
        raise HTTPException(
            status_code=400, detail="image_type 必须为 character/object/scene"
        )
    if not subject.strip():
        raise HTTPException(status_code=400, detail="subject 不能为空")

    # 2. 读取可选参考图
    ref_bytes: bytes | None = None
    ref_ct: str | None = None
    if reference_image is not None:
        if reference_image.content_type not in _ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的图片格式：{reference_image.content_type}，仅支持 jpeg/png/webp",
            )
        ref_bytes = await reference_image.read()
        ref_ct = reference_image.content_type
        if not ref_bytes:
            raise HTTPException(status_code=400, detail="参考图文件为空")

    logger.info(
        "[API] 一致性生图请求: image_type=%s, subject=%s, has_ref=%s",
        image_type,
        subject,
        ref_bytes is not None,
    )

    try:
        # 3. 构造 prompt（模板 + str.replace 填占位符）
        prompt = build_prompt(image_type, subject, style_preference)

        # 4. 调 API 生成单张图
        image_url, mode = await generate_consistency_image(
            prompt=prompt,
            image_type=image_type,
            size=size,
            negative_prompt=negative_prompt,
            reference_image_bytes=ref_bytes,
            reference_content_type=ref_ct,
        )

        # 自动收集：一致性生图落库到资产表（失败仅记日志，不阻断主流程）
        try:
            record_asset(
                db,
                _current_user.id,
                source="consistency",
                media_type="image",
                url=image_url,
                file_path=url_to_local_path(image_url),
                filename=Path(image_url).name if image_url else None,
                title=subject,
                meta={"image_type": image_type, "consistency_mode": mode},
            )
        except Exception:
            logger.warning("[assets] 一致性生图资产落库失败 url=%s", image_url, exc_info=True)

        # 5. 返回结果
        return {
            "status": "success",
            "image_type": image_type,
            "image_url": image_url,
            "prompt": prompt,
            "consistency_mode": mode,
            "subject": subject,
        }

    except HTTPException:
        raise
    except ValueError as e:
        logger.exception("[API] 一致性生图参数错误")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("[API] 一致性生图失败")
        raise HTTPException(
            status_code=500, detail=f"一致性生图失败: {e}"
        ) from e


@router.get("/api/consistency-images/health", summary="一致性生图健康检查")
def health(_current_user: User = Depends(get_current_user)) -> dict[str, str]:
    """一致性生图模块健康检查（需登录）。"""
    return {"status": "ok", "module": "consistency-images"}
