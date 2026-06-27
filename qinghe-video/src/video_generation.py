"""视频生成展示服务。

当前项目尚未接入真实视频生成协议，这里提供统一的 API 形状，前端可展示待接入状态。
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from src.config import settings


class VideoGenerationRequest(BaseModel):
    """视频生成请求。"""

    prompt: str = Field(..., min_length=1, description="视频生成提示词")
    image_url: str | None = Field(None, description="可选首帧图 URL")
    duration_seconds: int = Field(5, ge=3, le=15, description="视频时长")
    size: str | None = Field(None, description="视频尺寸")


def build_video_preview(request: VideoGenerationRequest) -> dict[str, object]:
    """返回视频生成预览配置，便于前端展示待生成视频卡片。"""
    return {
        "status": "preview",
        "model": settings.VIDEO_MODEL,
        "size": request.size or settings.VIDEO_SIZE,
        "duration_seconds": request.duration_seconds,
        "prompt": request.prompt,
        "image_url": request.image_url,
        "message": "视频生成接口已预留；当前展示生成配置，待接入中转站视频生成协议后可返回真实 video_url。",
        "video_url": None,
    }
