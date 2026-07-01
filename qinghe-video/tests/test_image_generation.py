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
