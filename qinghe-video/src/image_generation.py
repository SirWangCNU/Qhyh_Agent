"""图片生成服务。

通过 OpenAI 兼容的中转站调用 doubao-seedream 图片生成模型。
支持可选参考图（图生图）：传入 reference_image_path 指向 outputs/image/ 下的文件。
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.request
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, Field

from src.config import PROJECT_ROOT, settings

# #region debug-point setup:debug-reporter
_DEBUG_ENV_PATH = os.path.join(PROJECT_ROOT, ".dbg", "canvas-two-refs-disconnect.env")
_DEBUG_SERVER_URL = "http://127.0.0.1:7777/event"
_DEBUG_SESSION_ID = "canvas-two-refs-disconnect"
try:
    with open(_DEBUG_ENV_PATH, "r", encoding="utf-8") as _f:
        for _line in _f:
            if _line.startswith("DEBUG_SERVER_URL="):
                _DEBUG_SERVER_URL = _line.strip().split("=", 1)[1]
            elif _line.startswith("DEBUG_SESSION_ID="):
                _DEBUG_SESSION_ID = _line.strip().split("=", 1)[1]
except Exception:
    pass


def _report_debug(hypothesis_id: str, location: str, msg: str, data: dict | None = None, run_id: str = "pre-fix") -> None:
    try:
        payload = json.dumps({
            "sessionId": _DEBUG_SESSION_ID,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "msg": f"[DEBUG] {msg}",
            "data": data or {},
        }).encode("utf-8")
        urllib.request.urlopen(
            urllib.request.Request(_DEBUG_SERVER_URL, data=payload, headers={"Content-Type": "application/json"}),
            timeout=2,
        ).read()
    except Exception:
        pass
# #endregion

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
    model: str | None = Field(
        None,
        description="本次生成使用的模型 id，未指定时回退到 settings.IMAGE_MODEL",
    )
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
        "model": request.model or settings.IMAGE_MODEL,
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


# ---------- 多参考图生成（canvas 模块用） ----------

# 本地图缓存目录（与 image_studio/image_variants 共用 outputs/image/）
_CANVAS_OUTPUT_DIR = PROJECT_ROOT / "outputs" / "image"


def _resolve_output_image(url: str) -> tuple[bytes, str] | None:
    """把 /outputs/xxx/yyy.jpg 解析为 (字节, MIME)。

    支持任意 outputs 子目录（upload/image/...），取 basename 防穿越。
    文件不存在或扩展名不支持时返回 None。
    """
    if not url.startswith("/outputs/"):
        return None
    filename = Path(url).name
    outputs_root = PROJECT_ROOT / "outputs"
    # rglob 避免硬编码子目录（upload/image/...）
    candidates = list(outputs_root.rglob(filename))
    if not candidates:
        return None
    ref_file = candidates[0]
    ext = ref_file.suffix.lower()
    mime = _EXT_TO_MIME.get(ext)
    if not mime:
        return None
    return ref_file.read_bytes(), mime


def _encode_to_b64(file_bytes: bytes, mime: str) -> str:
    """字节转 data URI base64（与 image_studio.image_variants.encode_upload_to_b64 等价）。"""
    fmt = mime.split("/", 1)[1].lower() if "/" in mime else "jpeg"
    if fmt == "jpg":
        fmt = "jpeg"
    encoded = base64.b64encode(file_bytes).decode("ascii")
    return f"data:image/{fmt};base64,{encoded}"


async def _download_image_to_local(client: httpx.AsyncClient, url: str) -> str:
    """下载远程图片到 outputs/image/，返回本地 URL /outputs/image/canvas_xxx.jpg。"""
    _CANVAS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    resp = await client.get(url)
    resp.raise_for_status()
    ts = int(time.time() * 1000)
    filename = f"canvas_{ts}.jpg"
    (_CANVAS_OUTPUT_DIR / filename).write_bytes(resp.content)
    return f"/outputs/image/{filename}"


async def generate_with_references(
    *,
    prompt: str,
    negative_prompt: str | None = None,
    content_refs: list[str] | None = None,
    style_refs: list[str] | None = None,
    structure_refs: list[str] | None = None,
    size: str | None = None,
    n: int = 1,
    model: str | None = None,
) -> str:
    """多参考图生成（canvas 专用）。

    降级策略（doubao-seedream gateway 仅支持单张参考图）：
    - content_refs[0] 作为主参考图走图生图（保证内容一致性）
    - style/structure refs 信息注入 prompt 文字描述（实际不传图）
    - 生成结果下载到 outputs/image/，返回本地 URL

    Args:
        model: 本次生成使用的模型 id，未指定时回退到 settings.IMAGE_MODEL。

    Returns:
        本地图片 URL /outputs/image/canvas_xxx.jpg
    """
    # #region debug-point C:generate-entry
    _report_debug("C", "image_generation.py:generate_with_references", "generate_with_references 入口", {
        "content_refs": content_refs,
        "style_refs": style_refs,
        "structure_refs": structure_refs,
        "size": size,
        "model": model,
        "has_api_key": bool(settings.AIAPIAL_API_KEY),
    })
    # #endregion

    if not settings.AIAPIAL_API_KEY:
        raise ValueError("未配置 AIAPIAL_API_KEY")

    effective_model = model or settings.IMAGE_MODEL

    # 组装 prompt：主提示词 + 参考图文字说明
    final_prompt = prompt
    extra_notes: list[str] = []
    # content 参考图：全部作为 image 数组传入，并在 prompt 中标记 @图N
    content_images_b64: list[str] = []
    content_ref_tags: list[str] = []
    for idx, ref_url in enumerate(content_refs or [], start=1):
        resolved = _resolve_output_image(ref_url)
        if resolved is None:
            continue
        ref_bytes, mime = resolved
        content_images_b64.append(_encode_to_b64(ref_bytes, mime))
        content_ref_tags.append(f"@图{idx}")
    if content_ref_tags:
        tags = "、".join(content_ref_tags)
        extra_notes.append(f"请参考{tags}的内容保持人物、物体、场景一致")
    if style_refs:
        extra_notes.append(f"参考{len(style_refs)}张风格图保持色调与艺术风格一致")
    if structure_refs:
        extra_notes.append(f"参考{len(structure_refs)}张结构图保持构图与透视")
    if extra_notes:
        final_prompt = f"{prompt}（{'；'.join(extra_notes)}）"

    payload: dict[str, Any] = {
        "model": effective_model,
        "prompt": final_prompt,
        "size": size or settings.IMAGE_SIZE,
        "n": n,
        "response_format": settings.IMAGE_RESPONSE_FORMAT,
        "watermark": False,
    }
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt

    # 多参考图：content 全部转成 base64 数组传入 seedream
    if content_images_b64:
        payload["image"] = content_images_b64 if len(content_images_b64) > 1 else content_images_b64[0]
    else:
        # 降级：没有 content 时取 style/structure 第一张
        all_refs = (style_refs or []) + (structure_refs or [])
        if all_refs:
            resolved = _resolve_output_image(all_refs[0])
            if resolved is not None:
                ref_bytes, mime = resolved
                payload["image"] = _encode_to_b64(ref_bytes, mime)

    # #region debug-point C:image-array
    _report_debug("C", "image_generation.py:generate_with_references", "参考图数组", {
        "content_images_count": len(content_images_b64),
        "image_field_type": "list" if isinstance(payload.get("image"), list) else type(payload.get("image")).__name__,
    })
    # #endregion

    payload_size_mb = len(json.dumps(payload).encode("utf-8")) / 1024 / 1024
    # #region debug-point C:payload-ready
    _report_debug("C", "image_generation.py:generate_with_references", "请求体就绪", {
        "payload_size_mb": round(payload_size_mb, 2),
        "has_image": "image" in payload,
        "model": effective_model,
        "size": payload["size"],
    })
    # #endregion

    base_url = settings.APILINK_API_BASE_URL.rstrip("/")
    # #region debug-point C:before-api-call
    _report_debug("C", "image_generation.py:generate_with_references", "调用图片生成 API", {"base_url": base_url})
    # #endregion
    t0 = time.time()
    async with httpx.AsyncClient(timeout=180) as client:
        try:
            response = await client.post(
                f"{base_url}/v1/images/generations",
                headers={"Authorization": f"Bearer {settings.AIAPIAL_API_KEY}"},
                json=payload,
            )
        except Exception as e:
            # #region debug-point C:api-call-exception
            _report_debug("C", "image_generation.py:generate_with_references", "API 调用异常", {
                "error": str(e),
                "error_type": type(e).__name__,
                "elapsed_sec": round(time.time() - t0, 2),
            })
            # #endregion
            raise
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            # #region debug-point C:api-http-error
            _report_debug("C", "image_generation.py:generate_with_references", "API HTTP 错误", {
                "status_code": response.status_code,
                "response_text": response.text,
                "elapsed_sec": round(time.time() - t0, 2),
            })
            # #endregion
            raise RuntimeError(response.text) from exc

        elapsed = round(time.time() - t0, 2)
        data = response.json().get("data", [])
        # #region debug-point C:api-response
        _report_debug("C", "image_generation.py:generate_with_references", "API 响应", {
            "elapsed_sec": elapsed,
            "data_count": len(data),
            "first_item_keys": list(data[0].keys()) if data else [],
        })
        # #endregion
        if not data:
            raise RuntimeError("图片生成 API 未返回数据")

        item = data[0]
        image_url = item.get("url")
        b64_json = item.get("b64_json")

        if image_url:
            return await _download_image_to_local(client, image_url)
        if b64_json:
            _CANVAS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            ts = int(time.time() * 1000)
            filename = f"canvas_{ts}.jpg"
            (_CANVAS_OUTPUT_DIR / filename).write_bytes(base64.b64decode(b64_json))
            return f"/outputs/image/{filename}"
        raise RuntimeError("API 返回数据无 url 也无 b64_json")
