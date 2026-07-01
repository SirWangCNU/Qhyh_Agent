"""视频合成服务：把分镜图片轮播 + 旁白音频拼接为 9:16 竖屏 mp4。"""

from __future__ import annotations

import io
import math
import os
import tempfile
import uuid
from pathlib import Path

import httpx
from moviepy.editor import AudioFileClip, ImageClip, concatenate_videoclips
from PIL import Image

from src.config import settings


def _download_image(url: str) -> bytes:
    """下载图片 URL 返回字节（支持 http 和本地路径）。"""
    if url.startswith(("http://", "https://")):
        with httpx.Client(timeout=60, follow_redirects=True, trust_env=False) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.content
    # 本地路径
    return Path(url).read_bytes()


def _fit_to_vertical(image_bytes: bytes, target_w: int, target_h: int) -> str:
    """用 Pillow 把图片裁切缩放到 1080x1920 竖屏，返回临时文件路径。

    采用 cover 模式：保持比例居中裁切到目标宽高比，再缩放到目标尺寸。
    """
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("RGB")
        target_ratio = target_w / target_h
        current_ratio = img.width / img.height

        if current_ratio > target_ratio:
            # 图片更宽，居中裁切左右
            new_width = int(img.height * target_ratio)
            left = (img.width - new_width) // 2
            img = img.crop((left, 0, left + new_width, img.height))
        else:
            # 图片更高，居中裁切上下
            new_height = int(img.width / target_ratio)
            top = (img.height - new_height) // 2
            img = img.crop((0, top, img.width, top + new_height))

        img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)

        temp_path = os.path.join(
            tempfile.gettempdir(), f"qinghe_{uuid.uuid4().hex}.jpg"
        )
        img.save(temp_path, format="JPEG", quality=92)
    return temp_path


def compose(image_urls: list[str], audio_path: str, output_path: str) -> str:
    """合成 9:16 竖屏 mp4 视频。

    Args:
        image_urls: 图片 URL 或本地路径列表。
        audio_path: TTS 旁白音频 mp3 路径。
        output_path: 输出 mp4 路径。

    Returns:
        str: 实际写入的 mp4 文件路径。

    若音频时长大于图片总时长，会循环图片以填满音频；
    若音频时长小于图片总时长，会截断视频到音频时长。
    """
    # 1. 解析分辨率
    w_str, h_str = settings.video_resolution.split("x")
    target_w, target_h = int(w_str), int(h_str)
    per_image_duration = settings.video_per_image_duration

    # 2. 下载并裁切每张图片到竖屏
    temp_paths: list[str] = []
    try:
        for url in image_urls:
            img_bytes = _download_image(url)
            temp_paths.append(_fit_to_vertical(img_bytes, target_w, target_h))

        # 3. 创建 ImageClip，每张持续 per_image_duration 秒
        base_clips = [
            ImageClip(p).set_duration(per_image_duration) for p in temp_paths
        ]

        # 4. 加载音频
        audio = AudioFileClip(audio_path)
        audio_duration = audio.duration or 0.0

        # 5. 循环图片以填满音频时长
        total_image_duration = per_image_duration * len(base_clips)
        if audio_duration > total_image_duration > 0:
            cycles = math.ceil(audio_duration / total_image_duration)
            clips = base_clips * cycles
        else:
            clips = list(base_clips)

        video = concatenate_videoclips(clips, method="compose")

        # 6. 截断视频到音频时长
        if audio_duration > 0 and video.duration > audio_duration:
            video = video.subclip(0, audio_duration)

        # 7. 设置音频并写入 mp4
        video = video.set_audio(audio)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        video.write_videofile(
            output_path,
            fps=settings.video_fps,
            codec="libx264",
            audio_codec="aac",
            verbose=False,
            logger=None,
        )

        # 8. 释放资源
        video.close()
        audio.close()

        return output_path
    finally:
        # 9. 清理临时图片文件
        for p in temp_paths:
            try:
                os.remove(p)
            except OSError:
                pass


if __name__ == "__main__":
    # 简单冒烟测试：合成两张本地图片 + 一段 TTS 音频到 outputs/video/sample.mp4
    sample_images = ["outputs/image/scene_01.jpg", "outputs/image/scene_02.jpg"]
    sample_audio = "outputs/audio/sample.mp3"
    output = "outputs/video/sample.mp4"

    if not all(Path(p).exists() for p in sample_images + [sample_audio]):
        print("[VideoCompose] 跳过冒烟测试（缺少素材文件）")
    else:
        result = compose(sample_images, sample_audio, output)
        print(f"[VideoCompose] 合成完成：{result}")
