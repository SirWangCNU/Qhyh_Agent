"""图片生成服务。

通过 OpenAI 兼容的中转站调用 doubao-seedream 图片生成模型。
支持可选参考图（图生图）：传入 reference_image_path 指向 outputs/image/ 下的文件。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, Field

from src.config import PROJECT_ROOT, settings

# 参考图文件扩展名 → MIME 映射
_EXT_TO_MIME: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


class ImageGenerationRequest(BaseModel):
    """图片生成请求。"""

    prompt: str = Field(..., min_length=1, description="图片生成提示词")
    negative_prompt: str | None = Field(None, description="负向提示词")
    size: str | None = Field(None, description="图像尺寸，如 1920x1920")
    n: int = Field(1, ge=1, le=4, description="生成数量")
    reference_image_path: str | None = Field(
        None,
        description="可选参考图路径（相对 URL 如 /outputs/image/xxx.jpg 或纯文件名），"
        "存在则走图生图保证与参考图一致性",
    )


class ImageGenerationResult(BaseModel):
    """图片生成结果。"""

    url: str | None = None
    b64_json: str | None = None
    size: str | None = None
    revised_prompt: str | None = None


def _resolve_reference_image(path_str: str) -> tuple[bytes, str] | None:
    """把参考图路径解析为 (字节, MIME)。

    只允许 outputs/image/ 目录下的文件，取 basename 防路径穿越。
    文件不存在或扩展名不支持时返回 None（静默降级为文生图）。
    """
    filename = Path(path_str).name  # 只取文件名，防穿越
    ref_file = PROJECT_ROOT / "outputs" / "image" / filename
    if not ref_file.exists():
        return None
    ext = ref_file.suffix.lower()
    mime = _EXT_TO_MIME.get(ext)
    if not mime:
        return None
    return ref_file.read_bytes(), mime


async def generate_image(request: ImageGenerationRequest) -> list[ImageGenerationResult]:
    """调用图片生成接口并返回结果列表。

    若 request.reference_image_path 指向 outputs/image/ 下的有效图片，
    则读取该文件转 base64 data URI 注入 payload['image']，走图生图；
    否则走纯文生图（向后兼容）。
    """
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

    # 可选参考图 → 图生图
    if request.reference_image_path:
        resolved = _resolve_reference_image(request.reference_image_path)
        if resolved is not None:
            from src.image_studio.image_variants import encode_upload_to_b64

            ref_bytes, mime = resolved
            payload["image"] = encode_upload_to_b64(ref_bytes, mime)

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
