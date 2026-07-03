"""视频生成服务单元测试。

全部使用 mock HTTP，不需要真实 API Key。
"""

from __future__ import annotations

import base64
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.config import PROJECT_ROOT, settings
from src.video_generation import (
    VideoGenerationRequest,
    _build_video_payload,
    _encode_to_b64,
    _resolve_output_image,
    _resolve_reference_images,
    generate_video,
    poll_video_task,
    query_video_task,
    submit_video_generation,
)


def _mock_async_client(mock_post_or_get: AsyncMock) -> MagicMock:
    """构造支持 async with 的 httpx.AsyncClient mock。"""
    client_mock = MagicMock()
    client_mock.__aenter__ = AsyncMock(return_value=client_mock)
    client_mock.__aexit__ = AsyncMock(return_value=None)
    client_mock.post = mock_post_or_get
    client_mock.get = mock_post_or_get
    return client_mock


@pytest.mark.asyncio
async def test_submit_video_generation_success() -> None:
    """提交视频任务成功，返回 task_id。"""
    post_mock = AsyncMock()
    response_mock = MagicMock()
    response_mock.raise_for_status = MagicMock()
    response_mock.json.return_value = {
        "id": "task_123",
        "status": "processing",
    }
    post_mock.return_value = response_mock

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(post_mock)):
        result = await submit_video_generation(
            VideoGenerationRequest(prompt="测试中")
        )

    assert result.task_id == "task_123"
    assert result.status == "processing"
    assert result.error is None

    # 验证请求体关键字段
    call_args = post_mock.call_args
    assert call_args.kwargs["json"]["model"] == settings.VIDEO_MODEL
    assert call_args.kwargs["json"]["prompt"] == "测试中"
    assert call_args.kwargs["json"]["metadata"]["resolution"] == "720p"
    assert call_args.kwargs["json"]["metadata"]["ratio"] == "9:16"
    assert call_args.kwargs["json"]["metadata"]["duration"] == 8
    assert call_args.kwargs["json"]["metadata"]["generate_audio"] is True
    assert call_args.kwargs["json"]["metadata"]["watermark"] is False


@pytest.mark.asyncio
async def test_submit_video_generation_http_error() -> None:
    """提交视频任务时网关返回错误，应抛出 RuntimeError。"""
    post_mock = AsyncMock()
    response_mock = MagicMock()
    request_mock = MagicMock()
    response_mock.raise_for_status.side_effect = httpx.HTTPStatusError(
        "bad request", request=request_mock, response=response_mock
    )
    response_mock.text = "bad request"
    post_mock.return_value = response_mock

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(post_mock)):
        with pytest.raises(RuntimeError, match="bad request"):
            await submit_video_generation(
                VideoGenerationRequest(prompt="测试中")
            )


@pytest.mark.asyncio
async def test_query_video_task_success() -> None:
    """查询任务成功，返回 completed 与 video_url。"""
    get_mock = AsyncMock()
    response_mock = MagicMock()
    response_mock.raise_for_status = MagicMock()
    response_mock.json.return_value = {
        "id": "task_123",
        "status": "completed",
        "result": {"video_url": "https://example.com/video.mp4"},
    }
    get_mock.return_value = response_mock

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(get_mock)):
        result = await query_video_task("task_123")

    assert result.status == "completed"
    assert result.video_url == "https://example.com/video.mp4"


@pytest.mark.asyncio
async def test_poll_video_task_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """轮询任务从 processing 到 completed，返回 video_url。"""
    monkeypatch.setattr(settings, "VIDEO_POLL_INTERVAL", 0)
    monkeypatch.setattr(settings, "VIDEO_POLL_MAX_ATTEMPTS", 5)

    get_mock = AsyncMock()
    response_mock_processing = MagicMock()
    response_mock_processing.raise_for_status = MagicMock()
    response_mock_processing.json.return_value = {
        "id": "task_123",
        "status": "processing",
    }
    response_mock_completed = MagicMock()
    response_mock_completed.raise_for_status = MagicMock()
    response_mock_completed.json.return_value = {
        "id": "task_123",
        "status": "completed",
        "result": {"video_url": "https://example.com/video.mp4"},
    }
    get_mock.side_effect = [response_mock_processing, response_mock_completed]

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(get_mock)):
        video_url = await poll_video_task("task_123")

    assert video_url == "https://example.com/video.mp4"


@pytest.mark.asyncio
async def test_poll_video_task_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    """轮询任务返回 failed，应抛出 RuntimeError。"""
    monkeypatch.setattr(settings, "VIDEO_POLL_INTERVAL", 0)
    monkeypatch.setattr(settings, "VIDEO_POLL_MAX_ATTEMPTS", 5)

    get_mock = AsyncMock()
    response_mock = MagicMock()
    response_mock.raise_for_status = MagicMock()
    response_mock.json.return_value = {
        "id": "task_123",
        "status": "failed",
        "error": {"message": "生成失败：提示词违规"},
    }
    get_mock.return_value = response_mock

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(get_mock)):
        with pytest.raises(RuntimeError, match="生成失败"):
            await poll_video_task("task_123")


@pytest.mark.asyncio
async def test_poll_video_task_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    """轮询一直 processing，应超时抛出 RuntimeError。"""
    monkeypatch.setattr(settings, "VIDEO_POLL_INTERVAL", 0)
    monkeypatch.setattr(settings, "VIDEO_POLL_MAX_ATTEMPTS", 3)

    get_mock = AsyncMock()
    response_mock = MagicMock()
    response_mock.raise_for_status = MagicMock()
    response_mock.json.return_value = {
        "id": "task_123",
        "status": "processing",
    }
    get_mock.return_value = response_mock

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(get_mock)):
        with pytest.raises(RuntimeError, match="轮询超时"):
            await poll_video_task("task_123")


@pytest.mark.asyncio
async def test_generate_video_full_flow(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """完整流程：提交 → 轮询 → 下载，最终返回本地 video_url。"""
    monkeypatch.setattr(settings, "VIDEO_POLL_INTERVAL", 0)
    monkeypatch.setattr(settings, "VIDEO_POLL_MAX_ATTEMPTS", 5)

    # 重定向视频输出目录到 tmp_path
    from src import video_generation
    monkeypatch.setattr(video_generation, "_VIDEO_OUTPUT_DIR", tmp_path)

    submit_mock = AsyncMock()
    submit_response = MagicMock()
    submit_response.raise_for_status = MagicMock()
    submit_response.json.return_value = {"id": "task_abc", "status": "processing"}
    submit_mock.return_value = submit_response

    poll_response = MagicMock()
    poll_response.raise_for_status = MagicMock()
    poll_response.json.return_value = {
        "id": "task_abc",
        "status": "completed",
        "result": {"video_url": "https://example.com/final.mp4"},
    }

    download_response = MagicMock()
    download_response.raise_for_status = MagicMock()
    download_response.content = b"fake video bytes"

    # 依次处理：submit post / poll get / download get
    multi_mock = AsyncMock()
    multi_mock.side_effect = [submit_response, poll_response, download_response]

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(multi_mock)):
        result = await generate_video(
            VideoGenerationRequest(prompt="完整流程测试", duration=5)
        )

    assert result.status == "done"
    assert result.task_id == "task_abc"
    assert result.video_url == "/outputs/video/video_task_abc.mp4"
    assert (tmp_path / "video_task_abc.mp4").read_bytes() == b"fake video bytes"


@pytest.mark.asyncio
async def test_generate_video_submit_error() -> None:
    """提交即返回 error，应返回 error 响应。"""
    submit_mock = AsyncMock()
    submit_response = MagicMock()
    submit_response.raise_for_status = MagicMock()
    submit_response.json.return_value = {
        "id": "",
        "status": "failed",
        "error": {"message": "任务提交失败"},
    }
    submit_mock.return_value = submit_response

    with patch("src.video_generation.httpx.AsyncClient", return_value=_mock_async_client(submit_mock)):
        result = await generate_video(VideoGenerationRequest(prompt="提交失败测试"))

    assert result.status == "error"
    assert "提交失败" in result.error


def test_build_video_payload_with_references(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """验证请求体按 curl 示例构造，本地参考图转成 base64 data URI。"""
    from src import video_generation
    monkeypatch.setattr(video_generation, "_VIDEO_OUTPUT_DIR", tmp_path)

    # 构造测试图片
    test_image = tmp_path / "test.png"
    test_image.write_bytes(b"pngbytes")
    monkeypatch.setattr(
        video_generation,
        "_resolve_reference_images",
        lambda urls: ["data:image/png;base64,cG5nYnl0ZXM="] if urls else [],
    )

    payload = _build_video_payload(
        VideoGenerationRequest(
            prompt="人物在神庙中",
            model="doubao-seedance-2-0-fast-260128",
            reference_images=["/outputs/upload/test.png"],
            resolution="1080p",
            ratio="16:9",
            duration=10,
            generate_audio=False,
            watermark=True,
        )
    )

    assert payload["model"] == "doubao-seedance-2-0-fast-260128"
    assert payload["prompt"] == "人物在神庙中"
    assert payload["metadata"]["resolution"] == "1080p"
    assert payload["metadata"]["ratio"] == "16:9"
    assert payload["metadata"]["duration"] == 10
    assert payload["metadata"]["generate_audio"] is False
    assert payload["metadata"]["watermark"] is True
    assert len(payload["metadata"]["content"]) == 1
    assert payload["metadata"]["content"][0]["type"] == "image_url"
    assert payload["metadata"]["content"][0]["role"] == "reference_image"


def test_resolve_reference_images_local(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """本地 /outputs/ URL 被正确转成 base64 data URI。"""
    from src import video_generation
    monkeypatch.setattr(video_generation, "_VIDEO_OUTPUT_DIR", tmp_path)

    # 在真实 outputs 目录下创建测试图
    outputs_dir = PROJECT_ROOT / "outputs" / "upload"
    outputs_dir.mkdir(parents=True, exist_ok=True)
    test_file = outputs_dir / "local_ref.png"
    test_file.write_bytes(b"localpng")

    resolved = _resolve_reference_images(["/outputs/upload/local_ref.png"])
    assert len(resolved) == 1
    assert resolved[0].startswith("data:image/png;base64,")
    encoded = base64.b64encode(b"localpng").decode("ascii")
    assert resolved[0].endswith(encoded)


def test_resolve_reference_images_remote() -> None:
    """公网 URL 直接透传。"""
    urls = ["https://example.com/a.png", "http://example.com/b.jpg"]
    resolved = _resolve_reference_images(urls)
    assert resolved == urls


def test_resolve_reference_images_unsupported() -> None:
    """不支持的 URL 类型被静默忽略。"""
    resolved = _resolve_reference_images(["file:///etc/passwd", "ftp://x.png"])
    assert resolved == []


def test_encode_to_b64() -> None:
    """base64 编码与 data URI 格式正确。"""
    encoded = _encode_to_b64(b"abc", "image/jpeg")
    assert encoded == "data:image/jpeg;base64,YWJj"
