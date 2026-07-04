"""对话会话持久化模块测试：service 层 + API 端点 + 鉴权 + 用户隔离。

仿 tests/test_assets.py 模式：内存 SQLite + StaticPool + 每测试重建表。
覆盖：创建 / 列表分页 / 详情含消息 / 重命名 / 追加消息 / 删除级联 / 用户隔离 / 鉴权。
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.auth.security import hash_password
from src.conversation_sessions.persistence import (
    append_message,
    create_conversation,
    delete_conversation,
    get_conversation_detail,
    list_conversations,
    rename_conversation,
    update_iterations,
)
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
    """每条测试前建表 + 覆盖 get_db，后清理恢复。"""
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
    """直接造一个用户行。"""
    user = User(username=username, hashed_password=hash_password("pass123"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _client_with_token(username: str = "alice"):
    """注册 + 登录拿 token，返回 (client, token)。"""
    client = TestClient(app)
    client.post("/api/auth/register", json={"username": username, "password": "pass123456"})
    login_resp = client.post("/api/auth/login", json={"username": username, "password": "pass123456"})
    token = login_resp.json()["access_token"]
    return client, token


# ---------- service 层 ----------

def test_create_conversation_default_title():
    """无 title 时用 first_message 前 30 字生成标题。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id, first_message="为阳山水蜜桃生成 30 秒抖音视频")
    assert conv.id is not None
    assert conv.user_id == user.id
    assert conv.title.startswith("为阳山水蜜桃")
    assert conv.message_count == 0
    assert conv.iterations == 0


def test_create_conversation_empty_message_uses_default():
    """无 first_message 时标题为"新对话"。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id)
    assert conv.title == "新对话"


def test_list_conversations_pagination():
    """插入 3 条 → 分页返回。"""
    db = TestSession()
    user = _make_user(db)
    for i in range(3):
        create_conversation(db, user.id, title=f"会话{i}")
    items, total = list_conversations(db, user.id, page=1, page_size=2)
    assert total == 3
    assert len(items) == 2
    items2, _ = list_conversations(db, user.id, page=2, page_size=2)
    assert len(items2) == 1


def test_append_message_updates_count_and_seq():
    """追加消息后 message_count 递增，seq 连续。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id, title="t")
    m1 = append_message(db, conv.id, user.id, role="user", content="你好")
    m2 = append_message(db, conv.id, user.id, role="assistant", msg_type="react", content="你好，我是青禾", meta={"events": []})
    assert m1["seq"] == 1
    assert m2["seq"] == 2
    db.refresh(conv)
    assert conv.message_count == 2


def test_append_message_auto_updates_title():
    """首条 user 消息且标题为"新对话"时自动更新标题。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id)  # title = "新对话"
    append_message(db, conv.id, user.id, role="user", content="为五常大米写脚本")
    db.refresh(conv)
    assert conv.title.startswith("为五常大米")


def test_get_conversation_detail_returns_messages():
    """详情接口返回会话 + 全部消息（按 seq 升序）。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id, title="t")
    append_message(db, conv.id, user.id, role="user", content="A")
    append_message(db, conv.id, user.id, role="assistant", content="B")
    detail = get_conversation_detail(db, conv.id, user.id)
    assert detail is not None
    assert len(detail["messages"]) == 2
    assert detail["messages"][0]["content"] == "A"
    assert detail["messages"][1]["content"] == "B"


def test_rename_conversation():
    """重命名会话。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id, title="old")
    renamed = rename_conversation(db, conv.id, user.id, title="new title")
    assert renamed.title == "new title"


def test_update_iterations():
    """更新迭代数。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id)
    ok = update_iterations(db, conv.id, user.id, iterations=5)
    assert ok is True
    db.refresh(conv)
    assert conv.iterations == 5


def test_delete_conversation_cascades_messages():
    """删除会话后消息也被清除（CASCADE）。"""
    db = TestSession()
    user = _make_user(db)
    conv = create_conversation(db, user.id)
    append_message(db, conv.id, user.id, role="user", content="x")
    ok = delete_conversation(db, conv.id, user.id)
    assert ok is True
    assert get_conversation_detail(db, conv.id, user.id) is None


def test_user_isolation():
    """用户 A 看不到用户 B 的会话。"""
    db = TestSession()
    a = _make_user(db, "alice")
    b = _make_user(db, "bob")
    conv = create_conversation(db, a.id, title="alice的会话")
    # B 无法获取 A 的会话
    assert get_conversation_detail(db, conv.id, b.id) is None
    # B 无法追加消息
    assert append_message(db, conv.id, b.id, role="user", content="hack") is None
    # B 无法删除
    assert delete_conversation(db, conv.id, b.id) is False


# ---------- API 层 ----------

def test_api_create_without_token_401():
    """未登录创建会话返回 401。"""
    client = TestClient(app)
    resp = client.post("/api/conversation-sessions", json={})
    assert resp.status_code == 401


def test_api_create_and_list():
    """登录后创建会话，列表应包含。"""
    client, token = _client_with_token("conv_user1")
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.post(
        "/api/conversation-sessions",
        json={"first_message": "为西湖龙井策划短视频"},
        headers=headers,
    )
    assert resp.status_code == 200
    conv_id = resp.json()["id"]

    list_resp = client.get("/api/conversation-sessions", headers=headers)
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert data["total"] >= 1
    assert any(item["id"] == conv_id for item in data["items"])


def test_api_detail_returns_messages():
    """详情接口返回消息列表。"""
    client, token = _client_with_token("conv_user2")
    headers = {"Authorization": f"Bearer {token}"}
    create_resp = client.post(
        "/api/conversation-sessions",
        json={"title": "测试会话"},
        headers=headers,
    )
    conv_id = create_resp.json()["id"]
    # 追加两条消息
    client.post(
        f"/api/conversation-sessions/{conv_id}/messages",
        json={"role": "user", "content": "你好"},
        headers=headers,
    )
    client.post(
        f"/api/conversation-sessions/{conv_id}/messages",
        json={"role": "assistant", "type": "react", "content": "你好，我是青禾"},
        headers=headers,
    )
    detail = client.get(f"/api/conversation-sessions/{conv_id}", headers=headers)
    assert detail.status_code == 200
    msgs = detail.json()["messages"]
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[1]["role"] == "assistant"


def test_api_rename():
    """重命名接口。"""
    client, token = _client_with_token("conv_user3")
    headers = {"Authorization": f"Bearer {token}"}
    conv_id = client.post(
        "/api/conversation-sessions", json={"title": "old"}, headers=headers
    ).json()["id"]
    resp = client.put(
        f"/api/conversation-sessions/{conv_id}",
        json={"title": "new name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "new name"


def test_api_delete():
    """删除接口。"""
    client, token = _client_with_token("conv_user4")
    headers = {"Authorization": f"Bearer {token}"}
    conv_id = client.post(
        "/api/conversation-sessions", json={}, headers=headers
    ).json()["id"]
    resp = client.delete(f"/api/conversation-sessions/{conv_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


def test_api_user_isolation():
    """用户 A 创建的会话，用户 B 看不到。"""
    client_a, token_a = _client_with_token("conv_isolation_a")
    client_b, token_b = _client_with_token("conv_isolation_b")
    h_a = {"Authorization": f"Bearer {token_a}"}
    h_b = {"Authorization": f"Bearer {token_b}"}
    conv_id = client_a.post(
        "/api/conversation-sessions", json={"title": "a的"}, headers=h_a
    ).json()["id"]
    # B 看不到
    resp = client_b.get(f"/api/conversation-sessions/{conv_id}", headers=h_b)
    assert resp.status_code == 404
    # B 列表为空
    list_b = client_b.get("/api/conversation-sessions", headers=h_b).json()
    assert list_b["total"] == 0
