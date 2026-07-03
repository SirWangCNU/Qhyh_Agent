"""视频生成服务。

通过 OpenAI 兼容的中转站调用 doubao-seedance 视频生成模型。
支持参考图（本地 /outputs/... 或公网 URL），提交异步任务后轮询直到拿到视频 URL。
产物下载到 outputs/video/ 并通过 /outputs/video/xxx.mp4 访问。
"""

from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, Field, field_validator

from src.config import PROJECT_ROOT, settings

# 参考图文件扩展名 → MIME 映射
_EXT_TO_MIME: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

_VIDEO_OUTPUT_DIR = PROJECT_ROOT / "outputs" / "video"


# #region debug-point Z:video-ascii-reporter
import json, os, urllib.request

_VIDEO_ASCII_ENV_PATH = os.path.join(PROJECT_ROOT, ".dbg", "video-ascii-encode-error.env")
_VIDEO_ASCII_SERVER_URL = "http://127.0.0.1:7777/event"
_VIDEO_ASCII_SESSION_ID = "video-ascii-encode-error"
try:
    with open(_VIDEO_ASCII_ENV_PATH, "r", encoding="utf-8") as _f:
        for _line in _f:
            if _line.startswith("DEBUG_SERVER_URL="):
                _VIDEO_ASCII_SERVER_URL = _line.strip().split("=", 1)[1]
            elif _line.startswith("DEBUG_SESSION_ID="):
                _VIDEO_ASCII_SESSION_ID = _line.strip().split("=", 1)[1]
except Exception:
    pass


def _report_video_ascii(hypothesis_id: str, location: str, msg: str, data: dict | None = None, run_id: str = "pre-fix") -> None:
    try:
        payload = json.dumps({
            "sessionId": _VIDEO_ASCII_SESSION_ID,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "msg": f"[DEBUG] {msg}",
            "data": data or {},
        }, ensure_ascii=False, default=str).encode("utf-8")
        urllib.request.urlopen(
            urllib.request.Request(_VIDEO_ASCII_SERVER_URL, data=payload, headers={"Content-Type": "application/json"}),
            timeout=2,
        ).read()
    except Exception:
        pass
# #endregion


class VideoReferenceItem(BaseModel):
    """视频生成参考图项（符合 seedance metadata.content 格式）。"""

    type: str = "image_url"
    image_url: dict[str, str]
    role: str = "reference_image"


class VideoGenerationRequest(BaseModel):
    """视频生成请求。"""

    prompt: str = Field(..., min_length=1, description="视频生成提示词")
    model: str | None = Field(None, description="模型 id，默认 VIDEO_MODEL")
    reference_images: list[str] = Field(
        default_factory=list,
        description="参考图 URL 列表（本地 /outputs/... 或公网 http URL）",
    )
    resolution: str = Field(default="720p", description="输出分辨率，如 720p/1080p")
    ratio: str = Field(default="9:16", description="宽高比，如 9:16/16:9/1:1")
    duration: int = Field(default=8, ge=3, le=15, description="视频时长（秒）")
    generate_audio: bool = Field(default=True, description="是否生成音频")
    watermark: bool = Field(default=False, description="是否添加水印")
    negative_prompt: str | None = Field(None, description="负向提示词")

    @field_validator("reference_images", mode="before")
    @classmethod
    def _normalize_none(cls, v: Any) -> Any:
        if v is None:
            return []
        return v


class VideoTaskResponse(BaseModel):
    """视频任务响应。"""

    task_id: str
    status: str
    video_url: str | None = None
    error: str | None = None


class VideoGenerationResponse(BaseModel):
    """对外返回的视频生成结果。"""

    status: str = "done"
    video_url: str | None = None
    task_id: str | None = None
    error: str | None = None


def _get_video_api_base_url() -> str:
    """获取视频网关地址，独立配置为空时回退到图片网关。"""
    return (settings.VIDEO_API_BASE_URL or settings.APILINK_API_BASE_URL).rstrip("/")


def _get_video_api_key() -> str:
    """获取视频网关 Key，独立配置为空（或仅空白/注释）时回退到图片网关 Key。

    防御 .env 行内注释被误解析为值的情况（如 `VIDEO_API_KEY= # 注释`）。
    """
    candidate = (settings.VIDEO_API_KEY or "").strip()
    # 形如 `# xxx` 的行内注释被 python-dotenv 当成值时，跳过并回退
    if candidate.startswith("#"):
        candidate = ""
    return candidate or (settings.AIAPIAL_API_KEY or "").strip()


def _resolve_output_image(url: str) -> tuple[bytes, str] | None:
    """把 /outputs/xxx/yyy.jpg 解析为 (字节, MIME)。

    支持任意 outputs 子目录（upload/image/...），取 basename 防穿越。
    文件不存在或扩展名不支持时返回 None。
    """
    if not url.startswith("/outputs/"):
        return None
    filename = Path(url).name
    outputs_root = PROJECT_ROOT / "outputs"
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


def _resolve_reference_images(urls: list[str]) -> list[str]:
    """将参考图 URL 列表转换为网关可接受的格式。

    - 本地 /outputs/... URL → base64 data URI
    - 公网 http(s) URL → 直接透传
    - 其他或不存在的文件 → 静默忽略
    """
    resolved: list[str] = []
    for url in urls:
        if not url:
            continue
        if url.startswith("/outputs/"):
            ref = _resolve_output_image(url)
            if ref is not None:
                resolved.append(_encode_to_b64(*ref))
        elif url.startswith("http://") or url.startswith("https://"):
            resolved.append(url)
    return resolved


def _build_video_payload(request: VideoGenerationRequest) -> dict[str, Any]:
    """按 curl 示例构造请求体。"""
    content_refs: list[dict[str, Any]] = []
    for url in _resolve_reference_images(request.reference_images):
        content_refs.append(
            {
                "type": "image_url",
                "image_url": {"url": url},
                "role": "reference_image",
            }
        )

    metadata: dict[str, Any] = {
        "resolution": request.resolution or settings.VIDEO_SIZE or "720p",
        "ratio": request.ratio or "9:16",
        "duration": request.duration,
        "generate_audio": request.generate_audio,
        "watermark": request.watermark,
    }
    if content_refs:
        metadata["content"] = content_refs
    if request.negative_prompt:
        metadata["negative_prompt"] = request.negative_prompt

    return {
        "model": request.model or settings.VIDEO_MODEL,
        "prompt": request.prompt,
        "metadata": metadata,
    }


def _parse_task_response(data: dict[str, Any]) -> VideoTaskResponse:
    """解析网关任务响应。"""
    task_id = data.get("id") or data.get("task_id") or ""
    status = data.get("status") or "unknown"
    error = None
    video_url = None

    if status in ("failed", "error", "failure"):
        err = data.get("error") or {}
        error = err.get("message") if isinstance(err, dict) else str(err)
    else:
        result = data.get("result") or {}
        if isinstance(result, dict):
            video_url = result.get("video_url") or result.get("url")

    return VideoTaskResponse(
        task_id=str(task_id),
        status=str(status).lower(),
        video_url=video_url,
        error=error,
    )


async def submit_video_generation(
    request: VideoGenerationRequest,
) -> VideoTaskResponse:
    """提交视频生成任务，返回 task_id 与初始状态。"""
    # #region debug-point C:submit-entry
    _report_video_ascii(
        "C",
        "video_generation.py:submit_video_generation:entry",
        "submit_video_generation entry",
        {"api_key_len": len(_get_video_api_key() or ""), "base_url": _get_video_api_base_url()},
    )
    # #endregion
    api_key = _get_video_api_key()
    if not api_key:
        raise ValueError("未配置 AIAPIAL_API_KEY 或 VIDEO_API_KEY")

    payload = _build_video_payload(request)
    base_url = _get_video_api_base_url()

    # #region debug-point C:submit-payload
    _report_video_ascii(
        "C",
        "video_generation.py:submit_video_generation:payload",
        "video payload built",
        {"payload_model": payload.get("model"), "prompt_len": len(payload.get("prompt", "")), "metadata": payload.get("metadata")},
    )
    # #endregion

    async with httpx.AsyncClient(timeout=180, trust_env=False) as client:
        response = await client.post(
            f"{base_url}/v1/video/generations",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )

    # #region debug-point B:submit-response
    _report_video_ascii(
        "B",
        "video_generation.py:submit_video_generation:response",
        "video gateway submit response",
        {"status_code": response.status_code, "text_preview": response.text[:1000]},
    )
    # #endregion

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # #region debug-point B:submit-exception
        _report_video_ascii(
            "B",
            "video_generation.py:submit_video_generation:http-exception",
            "video gateway submit HTTP exception",
            {"exc_type": type(exc).__name__, "exc_str": str(exc), "response_text": response.text[:1000]},
        )
        # #endregion
        raise RuntimeError(response.text) from exc

    return _parse_task_response(response.json())


async def query_video_task(task_id: str) -> VideoTaskResponse:
    """查询单个视频生成任务状态。"""
    api_key = _get_video_api_key()
    base_url = _get_video_api_base_url()

    async with httpx.AsyncClient(timeout=60, trust_env=False) as client:
        response = await client.get(
            f"{base_url}/v1/video/generations/{task_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(response.text) from exc

    return _parse_task_response(response.json())


async def poll_video_task(task_id: str) -> str:
    """轮询视频任务直到完成或失败。

    Returns:
        最终视频 URL（公网地址）。

    Raises:
        RuntimeError: 任务失败或轮询超时。
    """
    interval = max(1, settings.VIDEO_POLL_INTERVAL)
    max_attempts = max(1, settings.VIDEO_POLL_MAX_ATTEMPTS)

    for attempt in range(max_attempts):
        result = await query_video_task(task_id)

        if result.error:
            raise RuntimeError(f"视频生成任务失败: {result.error}")
        if result.status in ("completed", "succeeded", "success", "done"):
            if not result.video_url:
                raise RuntimeError("视频任务已完成但未返回 video_url")
            return result.video_url
        if result.status in ("failed", "error", "failure"):
            raise RuntimeError("视频生成任务失败")

        # 最后一次还没完成则超时
        if attempt == max_attempts - 1:
            break
        await _async_sleep(interval)

    raise RuntimeError("视频生成任务轮询超时")


async def _async_sleep(seconds: float) -> None:
    """异步休眠，便于测试中 mock。"""
    import asyncio

    await asyncio.sleep(seconds)


async def _download_video(video_url: str, task_id: str) -> str:
    """下载视频到 outputs/video/，返回本地相对 URL。"""
    _VIDEO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(video_url.split("?", 1)[0]).suffix.lower() or ".mp4"
    filename = f"video_{task_id}{ext}"
    local_path = _VIDEO_OUTPUT_DIR / filename

    async with httpx.AsyncClient(timeout=180, trust_env=False) as client:
        resp = await client.get(video_url)
        resp.raise_for_status()
        local_path.write_bytes(resp.content)

    return f"/outputs/video/{filename}"


async def generate_video(
    request: VideoGenerationRequest,
) -> VideoGenerationResponse:
    """完整视频生成流程：提交 → 轮询 → 下载 → 返回本地 URL。"""
    # #region debug-point C:generate-video-entry
    _report_video_ascii(
        "C",
        "video_generation.py:generate_video:entry",
        "generate_video entry",
        {
            "model": request.model,
            "resolution": request.resolution,
            "ratio": request.ratio,
            "duration": request.duration,
            "generate_audio": request.generate_audio,
            "watermark": request.watermark,
            "prompt_preview": request.prompt[:200],
            "ref_count": len(request.reference_images),
        },
    )
    # #endregion
    submit_result = await submit_video_generation(request)
    if submit_result.error:
        return VideoGenerationResponse(
            status="error", error=submit_result.error, task_id=submit_result.task_id
        )
    if not submit_result.task_id:
        raise RuntimeError("视频网关未返回 task_id")

    video_url = await poll_video_task(submit_result.task_id)
    local_url = await _download_video(video_url, submit_result.task_id)

    return VideoGenerationResponse(
        status="done",
        video_url=local_url,
        task_id=submit_result.task_id,
    )


# ---------- 兼容旧 preview API 的占位（将逐步移除） ----------


def build_video_preview(request: VideoGenerationRequest) -> dict[str, object]:
    """返回视频生成预览配置，便于前端展示待生成视频卡片。"""
    return {
        "status": "preview",
        "model": request.model or settings.VIDEO_MODEL,
        "size": request.resolution or settings.VIDEO_SIZE,
        "duration_seconds": request.duration,
        "prompt": request.prompt,
        "image_url": request.reference_images[0] if request.reference_images else None,
        "message": "视频生成接口已接入；请调用 generate_video() 获取真实 video_url。",
        "video_url": None,
    }
