"""图片生成模块测试：包含 gpt-image-2 编辑生成端点。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src.main import app


# ---------- Helpers ----------


def _register_and_login(client: TestClient, username: str = "testuser") -> str:
    """注册并登录，返回 access_token。"""
    client.post("/api/auth/register", json={"username": username, "password": "testpass123"})
    resp = client.post("/api/auth/login", json={"username": username, "password": "testpass123"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ---------- 401 auth ----------


def test_edit_generate_without_token_401():
    """POST /api/images/edit-generate 无 token 应返回 401。"""
    client = TestClient(app)
    resp = client.post("/api/images/edit-generate", json={"prompt": "test prompt"})
    assert resp.status_code == 401


# ---------- Mocked provider success ----------


def test_edit_generate_success_mocked(monkeypatch):
    """模拟 gpt-image-2  provider 成功返回，端点应返回图片结果并落库。"""
    client = TestClient(app)
    token = _register_and_login(client)

    fake_url = "https://aiapiall.com/v1/images/generations"
    fake_key = "test-edit-key"

    class FakeResponse:
        status_code = 200
        _json = {"data": [{"url": "https://example.com/image.png", "size": "2K"}]}

        def raise_for_status(self):
            pass

        def json(self):
            return self._json

    class FakeAsyncClient:
        def __init__(self, timeout, **kwargs):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, headers, json):
            assert url == fake_url
            assert headers == {"Authorization": f"Bearer {fake_key}"}
            assert json["model"] == "gpt-image-2"
            assert json["prompt"] == "test prompt"
            assert json["size"] == "2K"
            assert json["aspect_ratio"] == "1:1"
            return FakeResponse()

    monkeypatch.setattr("src.image_generation.settings.IMAGE_EDIT_API_URL", fake_url)
    monkeypatch.setattr("src.image_generation.settings.IMAGE_EDIT_API_KEY", fake_key)
    monkeypatch.setattr("httpx.AsyncClient", FakeAsyncClient)

    resp = client.post(
        "/api/images/edit-generate",
        json={
            "prompt": "test prompt",
            "size": "2K",
            "aspect_ratio": "1:1",
            "n": 1,
            "model": "gpt-image-2",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    assert data["model"] == "gpt-image-2"
    assert data["size"] == "2K"
    assert len(data["images"]) == 1
    assert data["images"][0]["url"] == "https://example.com/image.png"


# ---------- Model validation ----------


def test_edit_image_request_model_requires_prompt():
    """EditImageGenerationRequest 必须包含 prompt。"""
    from src.image_generation import EditImageGenerationRequest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        EditImageGenerationRequest(prompt="")

    req = EditImageGenerationRequest(prompt="a cat")
    assert req.model == "gpt-image-2"
    assert req.n == 1
    assert req.watermark is False


# ---------- gpt-image-2 多参考图：data URI 转换 + prompt 注入 ----------


def test_local_url_to_data_uri_returns_none_for_non_outputs():
    """非 /outputs/ 开头的 URL 应返回 None。"""
    from src.image_generation import _local_url_to_data_uri

    assert _local_url_to_data_uri("https://example.com/a.jpg") is None
    assert _local_url_to_data_uri("/foo/bar.jpg") is None
    assert _local_url_to_data_uri("") is None


def test_local_url_to_data_uri_returns_none_for_missing_file(tmp_path, monkeypatch):
    """文件不存在时应返回 None。"""
    from src.image_generation import _local_url_to_data_uri, _resolve_output_image

    # 让 _resolve_output_image 找不到文件
    monkeypatch.setattr(
        "src.image_generation._resolve_output_image",
        lambda url: None,
    )
    assert _local_url_to_data_uri("/outputs/image/nonexistent.jpg") is None


def test_local_url_to_data_uri_converts_real_file(tmp_path, monkeypatch):
    """真实文件应转成 data:image/jpeg;base64,... 格式。"""
    from src.image_generation import _local_url_to_data_uri

    # 构造一个最小 JPEG 字节（不需要真实图片，只需能被读取）
    fake_bytes = b"\xff\xd8\xff\xe0test_jpeg_bytes\xff\xd9"
    monkeypatch.setattr(
        "src.image_generation._resolve_output_image",
        lambda url: (fake_bytes, "image/jpeg"),
    )
    result = _local_url_to_data_uri("/outputs/image/test.jpg")
    assert result is not None
    assert result.startswith("data:image/jpeg;base64,")


def test_gpt_prompt_includes_ref_notes_for_content_refs(monkeypatch):
    """content_refs 应在 prompt 开头注入"图1=人物参考"等说明。"""
    import asyncio
    from src.image_generation import _generate_with_references_gpt, EditImageGenerationRequest

    captured: dict = {}

    async def fake_generate_edit_image(req: EditImageGenerationRequest):
        captured["prompt"] = req.prompt
        captured["image"] = req.image
        captured["size"] = req.size
        from src.image_generation import ImageGenerationResult
        return [ImageGenerationResult(b64_json="ZmFrZQ==", size="1024x1024")]

    monkeypatch.setattr("src.image_generation.generate_edit_image", fake_generate_edit_image)
    # data URI 转换桩
    monkeypatch.setattr(
        "src.image_generation._local_url_to_data_uri",
        lambda url: f"data:image/jpeg;base64,FAKE_{url[-5:]}",
    )

    result = asyncio.run(
        _generate_with_references_gpt(
            prompt="一碗米饭特写",
            content_refs=["/outputs/image/a.jpg", "/outputs/image/b.jpg", "/outputs/image/c.jpg"],
            style_refs=None,
            structure_refs=None,
            size="1024x1024",
            model="gpt-image-2",
        )
    )

    # prompt 应包含三类参考图说明
    assert "以下是我已上传的3张参考图，请直接用于生成，不要要求再次上传" in captured["prompt"]
    assert "第1张图为人物参考" in captured["prompt"]
    assert "脸部特征与身份" in captured["prompt"]
    assert "第2张图为物品参考" in captured["prompt"]
    assert "物品外观与材质" in captured["prompt"]
    assert "第3张图为场景参考" in captured["prompt"]
    assert "场景环境与氛围" in captured["prompt"]
    # 原始 prompt 应保留在说明之后
    assert "一碗米饭特写" in captured["prompt"]
    # image 字段应是 data URI 列表（3 张）
    assert captured["image"] is not None
    assert len(captured["image"]) == 3
    assert all(item.startswith("data:image/jpeg;base64,") for item in captured["image"])
    # 应返回本地 URL
    assert result.startswith("/outputs/image/")


def test_gpt_prompt_no_ref_notes_when_content_refs_empty(monkeypatch):
    """无 content_refs 时 prompt 不注入参考图说明。"""
    import asyncio
    from src.image_generation import _generate_with_references_gpt, EditImageGenerationRequest, ImageGenerationResult

    captured: dict = {}

    async def fake_generate_edit_image(req: EditImageGenerationRequest):
        captured["prompt"] = req.prompt
        return [ImageGenerationResult(b64_json="ZmFrZQ==", size="1024x1024")]

    monkeypatch.setattr("src.image_generation.generate_edit_image", fake_generate_edit_image)

    asyncio.run(
        _generate_with_references_gpt(
            prompt="纯文生图",
            content_refs=None,
            style_refs=None,
            structure_refs=None,
            size="1024x1024",
            model="gpt-image-2",
        )
    )

    assert captured["prompt"] == "纯文生图"
    assert "人物参考" not in captured["prompt"]

