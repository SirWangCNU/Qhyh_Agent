"""媒体生成工具（mock 占位实现）。

生图/生视频/TTS 当前返回占位结果，跑通 ReAct 主流程。
后续可替换为真实 image_generation / video_generation / tts_service 调用。
"""

from __future__ import annotations

import logging
import uuid

logger = logging.getLogger(__name__)


def generate_image_tool_func(prompt: str, size: str = "1920x1920") -> str:
    """生成图片（mock 占位）。

    TODO: 接入真实 src.image_generation.generate_image
    """
    # TODO: 接入真实 src.image_generation.generate_image
    mock_id = uuid.uuid4().hex[:8]
    url = f"/outputs/image/mock_{mock_id}.jpg"
    logger.info("[mock generate_image] prompt=%s, size=%s, url=%s", prompt, size, url)
    return f"[mock] 已生成图片\n提示词：{prompt}\n尺寸：{size}\n链接：{url}"


def generate_video_tool_func(prompt: str, duration: int = 5) -> str:
    """生成视频（mock 占位）。

    TODO: 接入真实 src.video_generation.generate_video
    """
    # TODO: 接入真实 src.video_generation.generate_video
    mock_id = uuid.uuid4().hex[:8]
    url = f"/outputs/video/mock_{mock_id}.mp4"
    logger.info("[mock generate_video] prompt=%s, duration=%s, url=%s", prompt, duration, url)
    return f"[mock] 已生成视频\n提示词：{prompt}\n时长：{duration}秒\n链接：{url}"


def generate_tts_tool_func(text: str, voice: str = "zh-CN-XiaoxiaoNeural") -> str:
    """生成语音配音（mock 占位）。

    TODO: 接入真实 src.tts_service.synthesize
    """
    # TODO: 接入真实 src.tts_service.synthesize
    mock_id = uuid.uuid4().hex[:8]
    url = f"/outputs/audio/mock_{mock_id}.mp3"
    logger.info(
        "[mock generate_tts] text_len=%d, voice=%s, url=%s", len(text), voice, url
    )
    preview = text[:80] + ("..." if len(text) > 80 else "")
    return f"[mock] 已生成配音\n文本：{preview}\n音色：{voice}\n链接：{url}"
