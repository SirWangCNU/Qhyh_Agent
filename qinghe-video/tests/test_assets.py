"""「我的资产」模块测试：service 层 + API 端点 + 鉴权 + 上传。

仿 tests/test_auth.py 模式：内存 SQLite + StaticPool + 每测试重建表。
覆盖：落库 / 列表分页筛选 / 用户隔离 / 详情 / 删除级联文件 / 来源统计 /
      MIME 校验 / 鉴权 / CRUD 全流程 / 扩展名类型推断。
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.assets.service import (
    _infer_media_type,
    delete_asset,
    get_asset,
    get_stats,
    list_assets,
    record_asset,
    save_uploaded_file,
)
from src.auth.security import hash_password
from src.db.database import Base, get_db
from src.db.models import User
from src.main import app

# ---------- 内存测试 DB ----------

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    """每条测试前建表 + 覆盖 get_db，后清理恢复原 override。

    用 fixture 而非模块级赋值，避免与 test_auth.py 同时收集时
    app.dependency_overrides 全局状态互相污染。
    """
    original = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if original is not None:
        app.dependency_overrides[get_db] = original
    else:
        app.dependency_overrides.pop(get_db, None)


# ---------- 辅助 ----------

def _make_user(db, username: str = "tester") -> User:
    """直接造一个用户行（不经过 register API）。"""
    user = User(username=username, hashed_password=hash_password("pass123"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _client_with_token(username: str = "alice"):
    """注册 + 登录拿 token，返回 (client, token, user_id)。"""
    client = TestClient(app)
    client.post("/api/auth/register", json={"username": username, "password": "pass123456"})
    login_resp = client.post("/api/auth/login", json={"username": username, "password": "pass123456"})
    token = login_resp.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    return client, token, me.json()["id"]


# ---------- service 层 ----------

def test_record_asset_creates_row():
    """record_asset 应创建一条 asset 行，字段正确写入。"""
    db = TestSession()
    user = _make_user(db)
    asset = record_asset(
        db,
        user.id,
        source="tts",
        media_type="audio",
        url="/outputs/audio/x.mp3",
        file_path="/abs/outputs/audio/x.mp3",
        filename="x.mp3",
        mime_type="audio/mpeg",
        title="测试音频",
        meta={"k": "v"},
    )
    assert asset.id is not None
    assert asset.user_id == user.id
    assert asset.source == "tts"
    assert asset.media_type == "audio"
    assert asset.url == "/outputs/audio/x.mp3"
    # meta_json 应为 JSON 字符串
    assert asset.meta_json is not None and "k" in asset.meta_json


def test_list_assets_pagination_and_filter():
    """插入 5 条 → 分页 + source 筛选生效。"""
    db = TestSession()
    user = _make_user(db)
    for i in range(3):
        record_asset(db, user.id, source="tts", media_type="audio",
                     url=f"/outputs/audio/a{i}.mp3", file_path=f"/p/a{i}.mp3")
    for i in range(2):
        record_asset(db, user.id, source="image_gen", media_type="image",
                     url=f"/outputs/image/b{i}.jpg", file_path=f"/p/b{i}.jpg")

    # 全量
    items, total = list_assets(db, user.id, page=1, page_size=10)
    assert total == 5
    assert len(items) == 5

    # source 筛选
    items, total = list_assets(db, user.id, source="tts")
    assert total == 3
    assert all(a.source == "tts" for a in items)

    # 分页
    items, total = list_assets(db, user.id, page=1, page_size=2)
    assert total == 5
    assert len(items) == 2


def test_list_assets_user_isolation():
    """两个用户资产互不可见。"""
    db = TestSession()
    u1 = _make_user(db, "u1")
    u2 = _make_user(db, "u2")
    record_asset(db, u1.id, source="tts", media_type="audio",
                 url="/outputs/audio/u1.mp3", file_path="/p/u1.mp3")
    record_asset(db, u2.id, source="tts", media_type="audio",
                 url="/outputs/audio/u2.mp3", file_path="/p/u2.mp3")

    items1, total1 = list_assets(db, u1.id)
    items2, total2 = list_assets(db, u2.id)
    assert total1 == 1 and items1[0].url.endswith("u1.mp3")
    assert total2 == 1 and items2[0].url.endswith("u2.mp3")


def test_get_asset_returns_none_for_other_user():
    """get_asset 应做归属校验，他用户资产返回 None。"""
    db = TestSession()
    u1 = _make_user(db, "u1")
    u2 = _make_user(db, "u2")
    asset = record_asset(db, u1.id, source="tts", media_type="audio",
                         url="/outputs/audio/x.mp3", file_path="/p/x.mp3")
    assert get_asset(db, asset.id, u1.id) is not None
    assert get_asset(db, asset.id, u2.id) is None


def test_delete_asset_removes_row_and_file(tmp_path):
    """delete_asset 应同时删 DB 行与物理文件。"""
    fake_file = tmp_path / "fake.mp3"
    fake_file.write_bytes(b"audio data")

    db = TestSession()
    user = _make_user(db)
    asset = record_asset(db, user.id, source="tts", media_type="audio",
                         url="/outputs/audio/fake.mp3", file_path=str(fake_file),
                         filename="fake.mp3")
    asset_id = asset.id
    assert fake_file.exists()

    assert delete_asset(db, asset_id, user.id) is True
    assert not fake_file.exists()
    assert get_asset(db, asset_id, user.id) is None


def test_delete_asset_returns_false_for_other_user():
    """删除他用户资产应返回 False（不删除任何东西）。"""
    db = TestSession()
    u1 = _make_user(db, "u1")
    u2 = _make_user(db, "u2")
    asset = record_asset(db, u1.id, source="tts", media_type="audio",
                         url="/outputs/audio/x.mp3", file_path="/p/x.mp3")
    assert delete_asset(db, asset.id, u2.id) is False
    assert get_asset(db, asset.id, u1.id) is not None


def test_get_stats_groups_by_source():
    """get_stats 按 source 聚合 count。"""
    db = TestSession()
    user = _make_user(db)
    for _ in range(3):
        record_asset(db, user.id, source="tts", media_type="audio",
                     url="/outputs/audio/a.mp3", file_path="/p/a.mp3")
    for _ in range(2):
        record_asset(db, user.id, source="image_gen", media_type="image",
                     url="/outputs/image/b.jpg", file_path="/p/b.jpg")
    stats = get_stats(db, user.id)
    by_source = {s["source"]: s["count"] for s in stats}
    assert by_source.get("tts") == 3
    assert by_source.get("image_gen") == 2


def test_save_uploaded_file_rejects_bad_mime(monkeypatch, tmp_path):
    """非法 MIME 应抛 ValueError，不写文件。"""
    monkeypatch.setattr("src.assets.service.UPLOAD_DIR", tmp_path)
    with pytest.raises(ValueError):
        save_uploaded_file(b"data", "application/octet-stream", "x.bin")
    assert not list(tmp_path.iterdir())


def test_save_uploaded_file_writes_and_returns_url(monkeypatch, tmp_path):
    """合法 MIME 应写文件并返回 (url, file_path, filename, size)。"""
    monkeypatch.setattr("src.assets.service.UPLOAD_DIR", tmp_path)
    url, file_path, filename, size = save_uploaded_file(
        b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg", "photo.jpg"
    )
    assert url.startswith("/outputs/upload/")
    assert filename.endswith(".jpg")
    assert size == len(b"\xff\xd8\xff\xe0fakejpeg")
    assert (tmp_path / filename).exists()


def test_infer_media_type_by_extension():
    """扩展名 → media_type 推断正确。"""
    assert _infer_media_type("/outputs/video/x.mp4") == "video"
    assert _infer_media_type("/outputs/audio/x.mp3") == "audio"
    assert _infer_media_type("/outputs/image/x.jpg") == "image"
    assert _infer_media_type("/outputs/image/x.png") == "image"
    # 未知扩展名默认 image
    assert _infer_media_type("unknown.xyz") == "image"


def test_record_asset_auto_infers_media_type():
    """media_type=None 时应从 url 推断。"""
    db = TestSession()
    user = _make_user(db)
    asset = record_asset(db, user.id, source="image_gen", media_type=None,
                         url="/outputs/image/x.jpg", file_path="/p/x.jpg")
    assert asset.media_type == "image"


# ---------- API 端点 + 鉴权 ----------

def test_assets_endpoints_require_auth():
    """无 token 访问资产端点应全部 401。"""
    client = TestClient(app)
    assert client.get("/api/assets").status_code == 401
    assert client.get("/api/assets/stats").status_code == 401
    assert client.get("/api/assets/1").status_code == 401
    assert client.delete("/api/assets/1").status_code == 401
    # 上传端点无 token 也应 401
    resp = client.post(
        "/api/assets/upload",
        files={"file": ("x.jpg", b"data", "image/jpeg")},
    )
    assert resp.status_code == 401


def test_assets_crud_via_api(monkeypatch, tmp_path):
    """注册 → 登录 → 上传 → 列表 → 详情 → 删除 全流程。"""
    # 上传写文件到 tmp_path，避免污染真实 outputs/upload/
    monkeypatch.setattr("src.assets.service.UPLOAD_DIR", tmp_path)

    client, token, _uid = _client_with_token("crud_user")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. 上传一张图
    resp = client.post(
        "/api/assets/upload",
        headers=headers,
        files={"file": ("photo.jpg", b"\xff\xd8\xff\xe0fakejpeg", "image/jpeg")},
        data={"title": "我的测试图", "source": "upload"},
    )
    assert resp.status_code == 200, resp.text
    asset = resp.json()
    assert asset["source"] == "upload"
    assert asset["media_type"] == "image"
    assert asset["title"] == "我的测试图"
    asset_id = asset["id"]

    # 2. 列表应包含该资产
    resp = client.get("/api/assets", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == asset_id
    # meta_json 字段应为 dict 或 None（已解析）
    assert "meta_json" in data["items"][0]

    # 3. 详情
    resp = client.get(f"/api/assets/{asset_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["filename"].endswith(".jpg")

    # 4. 统计
    resp = client.get("/api/assets/stats", headers=headers)
    assert resp.status_code == 200
    stats = resp.json()
    assert any(s["source"] == "upload" and s["count"] == 1 for s in stats)

    # 5. 删除
    resp = client.delete(f"/api/assets/{asset_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == {"status": "deleted", "id": asset_id}

    # 6. 删除后详情 404
    resp = client.get(f"/api/assets/{asset_id}", headers=headers)
    assert resp.status_code == 404


def test_assets_list_filter_via_api():
    """列表端点 source / media_type 筛选 + 分页参数。"""
    client, token, _uid = _client_with_token("filter_user")
    headers = {"Authorization": f"Bearer {token}"}

    # 直接用 service 层插入两条不同来源资产（避免上传文件）
    db = TestSession()
    user = db.query(User).filter(User.username == "filter_user").first()
    record_asset(db, user.id, source="tts", media_type="audio",
                 url="/outputs/audio/a.mp3", file_path="/p/a.mp3")
    record_asset(db, user.id, source="image_gen", media_type="image",
                 url="/outputs/image/b.jpg", file_path="/p/b.jpg")

    # source 筛选
    resp = client.get("/api/assets?source=tts", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["source"] == "tts"
    assert data["source_filter"] == "tts"

    # media_type 筛选
    resp = client.get("/api/assets?media_type=image", headers=headers)
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["media_type"] == "image"
