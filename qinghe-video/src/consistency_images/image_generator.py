"""一致性生图调用器：单次调 doubao-seedream 生成单张合成大图。

- 有参考图 → 图生图（payload 带 image 字段）
- 无参考图 → 纯文生图（payload 不带 image 字段）

复用 src/image_studio/image_variants.py 的 encode_upload_to_b64 转换参考图。
"""

from __future__ import annotations

import base64
import logging
import time

import httpx

from src.config import PROJECT_ROOT, settings
from src.image_studio.image_variants import encode_upload_to_b64  # 复用

logger = logging.getLogger(__name__)

_OUTPUT_DIR = PROJECT_ROOT / "outputs" / "image"


async def generate_consistency_image(
    prompt: str,
    image_type: str,
    size: str | None,
    negative_prompt: str | None,
    reference_image_bytes: bytes | None,
    reference_content_type: str | None,
) -> tuple[str, str]:
    """调用 doubao-seedream 生成单张一致性参考图。

    Args:
        prompt: 完整 prompt（已填占位符）
        image_type: character / object / scene（用于文件命名）
        size: 图像尺寸，None 时取 settings.IMAGE_SIZE
        negative_prompt: 负向提示词（可选）
        reference_image_bytes: 参考图字节，None 表示纯文生图
        reference_content_type: 参考图 MIME，仅在有参考图时使用

    Returns:
        (image_url, consistency_mode)
        - image_url: 相对 URL，如 /outputs/image/consistency_character_xxx.jpg
        - consistency_mode: "image_to_image" 或 "text_to_image"
    """
    size = size or settings.IMAGE_SIZE
    payload: dict = {
        "model": settings.IMAGE_MODEL,
        "prompt": prompt,
        "size": size,
        "n": 1,
        "response_format": settings.IMAGE_RESPONSE_FORMAT,
        "watermark": False,
    }
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt

    mode = "text_to_image"
    if reference_image_bytes:
        ref_b64 = encode_upload_to_b64(
            reference_image_bytes, reference_content_type or "image/jpeg"
        )
        payload["image"] = ref_b64
        mode = "image_to_image"

    base_url = settings.APILINK_API_BASE_URL.rstrip("/")
    logger.info(
        "[ConsistencyImages] 请求 %s API: model=%s size=%s mode=%s",
        image_type,
        settings.IMAGE_MODEL,
        size,
        mode,
    )
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            resp = await client.post(
                f"{base_url}/v1/images/generations",
                headers={"Authorization": f"Bearer {settings.AIAPIAL_API_KEY}"},
                json=payload,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(
                "[ConsistencyImages] API 返回错误 status=%s body=%s",
                e.response.status_code,
                e.response.text[:500],
            )
            raise RuntimeError(f"图像 API 错误 {e.response.status_code}: {e.response.text[:200]}") from e
        except httpx.RequestError as e:
            logger.error("[ConsistencyImages] 请求 API 失败: %s", e)
            raise RuntimeError(f"图像 API 请求失败: {e}") from e

        data = resp.json().get("data", [])
        if not data:
            raise RuntimeError("API 未返回图像数据")
        item = data[0]

        _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(time.time() * 1000)
        filename = f"consistency_{image_type}_{ts}.jpg"

        if item.get("url"):
            img_resp = await client.get(item["url"])
            img_resp.raise_for_status()
            (_OUTPUT_DIR / filename).write_bytes(img_resp.content)
        elif item.get("b64_json"):
            (_OUTPUT_DIR / filename).write_bytes(base64.b64decode(item["b64_json"]))
        else:
            raise RuntimeError("API 返回数据无 url 也无 b64_json")

    logger.info(
        "[ConsistencyImages] %s 生成成功 mode=%s file=%s",
        image_type,
        mode,
        filename,
    )
    return f"/outputs/image/{filename}", mode
