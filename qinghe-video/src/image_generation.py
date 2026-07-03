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
    title: str | None = Field(
        None,
        description="资产标题，未指定时取 prompt 前 80 字符",
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
            ref_bytes, mime = resolved
            payload["image"] = _encode_to_b64(ref_bytes, mime)

    base_url = settings.APILINK_API_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=180, trust_env=False) as client:
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


# ---------- gpt-image-2 图片编辑生成 ----------


class EditImageGenerationRequest(BaseModel):
    """gpt-image-2 图片编辑/生成请求。"""

    prompt: str = Field(..., min_length=1, description="图片描述提示词")
    size: str | None = Field(None, description="图像尺寸，如 2K")
    aspect_ratio: str | None = Field(None, description="图像宽高比，如 1:1")
    n: int = Field(1, ge=1, le=4, description="生成数量")
    model: str = Field("gpt-image-2", description="模型 id")
    image: list[str] | None = Field(None, description="可选参考图 URL 列表")
    watermark: bool = Field(False, description="是否添加水印")
    title: str | None = Field(
        None,
        description="资产标题，未指定时取 prompt 前 80 字符",
    )


async def generate_edit_image(request: EditImageGenerationRequest) -> list[ImageGenerationResult]:
    """调用 gpt-image-2 图片编辑生成接口。

    使用 settings.IMAGE_EDIT_API_URL 与 IMAGE_EDIT_API_KEY，
    按 curl 示例格式发送 JSON 请求，返回图片结果列表。
    """
    if not settings.IMAGE_EDIT_API_KEY:
        raise ValueError("未配置 IMAGE_EDIT_API_KEY")

    payload: dict[str, Any] = {
        "model": request.model,
        "prompt": request.prompt,
        "size": request.size,
        "aspect_ratio": request.aspect_ratio,
        "n": request.n,
        "watermark": request.watermark,
    }
    if request.image:
        payload["image"] = request.image
    # gpt-image-2 多参考图生图：请求体大（base64）+ 服务器生成慢，需要更长 timeout
    # connect 短（连接快）、read 长（等生成，5 分钟）、write 适中（上传 base64）
    edit_timeout = httpx.Timeout(connect=30, read=300, write=120, pool=60)
    async with httpx.AsyncClient(timeout=edit_timeout, trust_env=False) as client:
        response = await client.post(
            settings.IMAGE_EDIT_API_URL,
            headers={"Authorization": f"Bearer {settings.IMAGE_EDIT_API_KEY}"},
            json=payload,
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(response.text) from exc

    data = response.json().get("data", [])
    return [ImageGenerationResult.model_validate(item) for item in data]


# ---------- 多参考图生成（canvas 模块用） ----------

# 本地图缓存目录（outputs/image/）
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
    """字节转 data URI base64。"""
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
    # gpt-image-2 分支：调用独立编辑生成接口
    if model and "gpt-image-2" in model:
        return await _generate_with_references_gpt(prompt, content_refs, style_refs, structure_refs, size, model)

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
    payload_size_mb = len(json.dumps(payload).encode("utf-8")) / 1024 / 1024
    base_url = settings.APILINK_API_BASE_URL.rstrip("/")
    t0 = time.time()
    async with httpx.AsyncClient(timeout=180, trust_env=False) as client:
        try:
            response = await client.post(
                f"{base_url}/v1/images/generations",
                headers={"Authorization": f"Bearer {settings.AIAPIAL_API_KEY}"},
                json=payload,
            )
        except Exception as e:
            raise
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(response.text) from exc

        elapsed = round(time.time() - t0, 2)
        data = response.json().get("data", [])
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


def _local_url_to_data_uri(url: str) -> str | None:
    """把 /outputs/xxx 本地相对 URL 转成 base64 data URI。

    远程网关无法访问本地文件，必须转成 data URI。
    复用 seedream 路径的 _resolve_output_image + _encode_to_b64。
    返回 None 表示转换失败（文件不存在/格式不支持等）。
    """
    resolved = _resolve_output_image(url)
    if resolved is None:
        return None
    file_bytes, mime = resolved
    return _encode_to_b64(file_bytes, mime)


# 参考图类型标签（按顺序对应 character/object/scene）
_GPT_REF_TYPE_LABELS = ["人物参考", "物品参考", "场景参考"]
_GPT_REF_TYPE_HINTS = {
    "人物参考": "脸部特征与身份",
    "物品参考": "物品外观与材质",
    "场景参考": "场景环境与氛围",
}


async def _generate_with_references_gpt(
    prompt: str,
    content_refs: list[str] | None,
    style_refs: list[str] | None,
    structure_refs: list[str] | None,
    size: str | None,
    model: str,
) -> str:
    """gpt-image-2 版本的参考图生成：复用 edit-generate 网关。

    与 seedream 路径的区别：
    1. 本地 /outputs/ URL 必须转成 base64 data URI（网关无法访问本地文件）
    2. content_refs 按顺序注入"图1=人物参考/图2=物品参考/图3=场景参考"文字说明到 prompt 开头
    """
    # 收集 image payload：本地 URL → data URI；公网 URL 直传
    image_payload: list[str] = []
    for ref_url in (content_refs or []) + (style_refs or []) + (structure_refs or []):
        if not ref_url:
            continue
        if ref_url.startswith("/outputs/"):
            data_uri = _local_url_to_data_uri(ref_url)
            if data_uri:
                image_payload.append(data_uri)
        elif ref_url.startswith("http"):
            image_payload.append(ref_url)
    # prompt 开头注入 content 参考图类型说明（人物/物品/场景）
    ref_notes: list[str] = []
    for i, ref_url in enumerate(content_refs or []):
        if not ref_url:
            continue
        label = _GPT_REF_TYPE_LABELS[i] if i < len(_GPT_REF_TYPE_LABELS) else f"补充参考{i + 1}"
        hint = _GPT_REF_TYPE_HINTS.get(label, "相关特征")
        ref_notes.append(f"第{i + 1}张图为{label}，请保持该图中的{hint}一致")

    extra_notes: list[str] = []
    if style_refs:
        extra_notes.append(f"参考{len(style_refs)}张风格图保持色调与艺术风格一致")
    if structure_refs:
        extra_notes.append(f"参考{len(structure_refs)}张结构图保持构图与透视")

    if ref_notes:
        uploaded_note = f"以下是我已上传的{len(ref_notes)}张参考图，请直接用于生成，不要要求再次上传：\n"
        ref_block = uploaded_note + "\n".join(ref_notes)
        if extra_notes:
            ref_block += "\n其他要求：" + "；".join(extra_notes)
        ref_block += "\n生成一张："
        final_prompt = f"{ref_block}\n{prompt}"
    elif extra_notes:
        final_prompt = f"{prompt}（{'；'.join(extra_notes)}）"
    else:
        final_prompt = prompt

    results = await generate_edit_image(
        EditImageGenerationRequest(
            model=model,
            prompt=final_prompt,
            size=size or settings.IMAGE_SIZE,
            n=1,
            image=image_payload or None,
            watermark=False,
        )
    )
    result = results[0]
    if result.url:
        async with httpx.AsyncClient(timeout=180, trust_env=False) as dl_client:
            return await _download_image_to_local(dl_client, result.url)
    if result.b64_json:
        _CANVAS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(time.time() * 1000)
        filename = f"canvas_{ts}.jpg"
        (_CANVAS_OUTPUT_DIR / filename).write_bytes(base64.b64decode(result.b64_json))
        return f"/outputs/image/{filename}"
    raise RuntimeError("API 返回数据无 url 也无 b64_json")
