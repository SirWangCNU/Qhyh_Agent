"""并发调用 doubao-seedream 图生图 API 生成 9 张变体图。

以用户上传图（base64）作为参考图，配合 LLM 生成的 9 个变体 prompt，
并发调用 OpenAI 兼容的 /v1/images/generations 端点，下载结果存 outputs/image/。

参考现有 src/image_generation.py 的调用模式，新增 image 参数支持图生图。
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from pathlib import Path

import httpx

from src.config import PROJECT_ROOT, settings
from src.image_studio.models import StyleVariant, VariantImageResult

logger = logging.getLogger(__name__)

_OUTPUTS_IMAGE_DIR = PROJECT_ROOT / "outputs" / "image"
_DEFAULT_SIZE = "1024x1024"


def encode_upload_to_b64(file_bytes: bytes, content_type: str) -> str:
    """把上传文件字节转为 data URI base64 格式。

    Args:
        file_bytes: 文件原始字节
        content_type: MIME 类型，如 image/png、image/jpeg

    Returns:
        str: data:image/<format>;base64,<编码>
    """
    # content_type 形如 "image/png" → format "png"；兜底用 jpeg
    fmt = "jpeg"
    if "/" in content_type:
        fmt = content_type.split("/", 1)[1].lower()
    # doubao-seedream 要求格式名小写，且不支持 jpg（用 jpeg）
    if fmt == "jpg":
        fmt = "jpeg"
    encoded = base64.b64encode(file_bytes).decode("ascii")
    return f"data:image/{fmt};base64,{encoded}"


async def _download_and_save(client: httpx.AsyncClient, url: str, variant_id: int) -> str:
    """下载图片 URL 字节到 outputs/image/，返回相对 URL /outputs/image/xxx.jpg。"""
    _OUTPUTS_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    response = await client.get(url)
    response.raise_for_status()
    ts = int(time.time() * 1000)
    filename = f"variant_{variant_id}_{ts}.jpg"
    filepath = _OUTPUTS_IMAGE_DIR / filename
    filepath.write_bytes(response.content)
    return f"/outputs/image/{filename}"


async def _generate_single(
    client: httpx.AsyncClient,
    variant: StyleVariant,
    reference_image_b64: str,
    size: str,
) -> VariantImageResult:
    """调用 doubao-seedream 生成单张变体图。"""
    payload: dict = {
        "model": settings.IMAGE_MODEL,
        "prompt": variant.prompt,
        "negative_prompt": variant.negative_prompt,
        "size": size,
        "n": 1,
        "response_format": settings.IMAGE_RESPONSE_FORMAT,
        "image": reference_image_b64,
        "watermark": False,
    }
    base_url = settings.APILINK_API_BASE_URL.rstrip("/")
    try:
        response = await client.post(
            f"{base_url}/v1/images/generations",
            headers={"Authorization": f"Bearer {settings.AIAPIAL_API_KEY}"},
            json=payload,
        )
        response.raise_for_status()
        data = response.json().get("data", [])
        if not data:
            raise RuntimeError("API 未返回图像数据")
        item = data[0]
        image_url = item.get("url")
        b64_json = item.get("b64_json")
        # 优先下载 URL 到本地；若返回 b64 则直接存盘
        if image_url:
            local_url = await _download_and_save(client, image_url, variant.variant_id)
            return VariantImageResult(
                variant_id=variant.variant_id,
                dimension_label=variant.dimension_label,
                prompt=variant.prompt,
                image_url=local_url,
            )
        if b64_json:
            _OUTPUTS_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
            ts = int(time.time() * 1000)
            filename = f"variant_{variant.variant_id}_{ts}.jpg"
            (_OUTPUTS_IMAGE_DIR / filename).write_bytes(base64.b64decode(b64_json))
            return VariantImageResult(
                variant_id=variant.variant_id,
                dimension_label=variant.dimension_label,
                prompt=variant.prompt,
                image_url=f"/outputs/image/{filename}",
                b64_json=b64_json,
            )
        raise RuntimeError("API 返回数据无 url 也无 b64_json")
    except Exception as e:
        logger.warning(
            "[ImageStudio] 变体 %d 生成失败: %s", variant.variant_id, e, exc_info=False
        )
        return VariantImageResult(
            variant_id=variant.variant_id,
            dimension_label=variant.dimension_label,
            prompt=variant.prompt,
            error=str(e),
        )


async def generate_variants(
    variants: list[StyleVariant],
    reference_image_b64: str,
    size: str | None,
) -> list[VariantImageResult]:
    """并发生成 9 张变体图，单张失败不阻断其余。

    Args:
        variants: LLM 生成的 9 个风格变体
        reference_image_b64: 参考图 data URI base64
        size: 单图尺寸，留空取默认 1024x1024

    Returns:
        list[VariantImageResult]: 按 variant_id 升序的结果列表
    """
    if not settings.AIAPIAL_API_KEY:
        raise ValueError("未配置 AIAPIAL_API_KEY")

    target_size = size or _DEFAULT_SIZE
    logger.info(
        "[ImageStudio] 并发生成 %d 张变体图，size=%s", len(variants), target_size
    )

    async with httpx.AsyncClient(timeout=180) as client:
        tasks = [
            _generate_single(client, v, reference_image_b64, target_size)
            for v in variants
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)

    results.sort(key=lambda r: r.variant_id)
    success = sum(1 for r in results if r.error is None)
    logger.info("[ImageStudio] 变体图生成完成：成功 %d/%d", success, len(results))
    return results
