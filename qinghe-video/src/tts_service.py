"""TTS 配音合成服务。

基于 edge-tts（微软 Edge 浏览器在线 TTS 接口）实现，
将文本合成为 mp3 音频文件，用于短视频旁白配音。

edge-tts 是异步库，本模块通过 asyncio.run 在同步函数中调度，
方便被 FastAPI 同步端点或 LangGraph 节点直接调用。
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import edge_tts

from src.config import settings


async def _synthesize_async(text: str, output_path: str) -> str:
    """异步合成核心实现。"""
    communicate = edge_tts.Communicate(
        text=text,
        voice=settings.tts_voice,
        rate=settings.tts_rate,
        volume=settings.tts_volume,
    )
    await communicate.save(output_path)
    return output_path


def synthesize(text: str, output_path: str) -> str:
    """将文本合成为 mp3 音频文件。

    Args:
        text: 待合成文本（非空）。
        output_path: 输出 mp3 文件路径；父目录会被自动创建。

    Returns:
        str: 实际写入的音频文件路径。
    """
    if not text or not text.strip():
        raise ValueError("待合成文本不能为空")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    # 在同步上下文中调度异步 edge-tts
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import threading

        result: dict[str, object] = {}

        def _run() -> None:
            try:
                result["path"] = asyncio.run(_synthesize_async(text, output_path))
            except Exception as exc:
                result["error"] = exc

        t = threading.Thread(target=_run)
        t.start()
        t.join()

        if "error" in result:
            raise RuntimeError(f"TTS 合成失败: {result['error']}")
        return str(result["path"])

    asyncio.run(_synthesize_async(text, output_path))
    return output_path


if __name__ == "__main__":
    # 简单冒烟测试：合成一句话到 outputs/audio/sample.mp3
    sample_text = "青禾映画，让农产品故事走得更远。"
    out = synthesize(sample_text, "outputs/audio/sample.mp3")
    print(f"[TTS] 合成完成：{out}")
