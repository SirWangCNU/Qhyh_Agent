"""图片生成服务。

通过 OpenAI 兼容的中转站调用 doubao-seedream 图片生成模型。
"""

from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, Field

from src.config import settings


class ImageGenerationRequest(BaseModel):
    """图片生成请求。"""

    prompt: str = Field(..., min_length=1, description="图片生成提示词")
    negative_prompt: str | None = Field(None, description="负向提示词")
    size: str | None = Field(None, description="图片尺寸，如 1920x1920")
    n: int = Field(1, ge=1, le=4, description="生成数量")


class ImageGenerationResult(BaseModel):
    """图片生成结果。"""

    url: str | None = None
    b64_json: str | None = None
    size: str | None = None
    revised_prompt: str | None = None


async def generate_image(request: ImageGenerationRequest) -> list[ImageGenerationResult]:
    """调用图片生成接口并返回结果列表。"""
    if not settings.AIAPIAL_API_KEY:
        raise ValueError("未配置 AIAPIAL_API_KEY")

    payload: dict[str, Any] = {
        "model": settings.IMAGE_MODEL,
        "prompt": request.prompt,
        "size": request.size or settings.IMAGE_SIZE,
        "n": request.n,
        "response_format": settings.IMAGE_RESPONSE_FORMAT,
    }
    if request.negative_prompt:
        payload["negative_prompt"] = request.negative_prompt

    base_url = settings.APILINK_API_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            f"{base_url}/v1/images/generations",
            headers={"Authorization": f"Bearer {settings.AIAPIAL_API_KEY}"},
            json=payload,
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(response.text) from exc

    data = response.json().get("data", [])
    return [ImageGenerationResult.model_validate(item) for item in data]
