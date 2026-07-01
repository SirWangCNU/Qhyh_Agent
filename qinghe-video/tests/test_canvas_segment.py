"""画布段级故事板（Storyboard Segment）模块测试。

覆盖段级导演板图生成（Prompt B · SMART SHOT SHEET V2）：

1. Pydantic 模型校验
   - SegmentInput：storyboard_text 非空；system_prompt 可选；node_id 可选
   - SegmentGenerateRequest：segments 至少 1 个；concurrency 1~8
2. _resolve_segment_references 参考图去空去重
3. _generate_single_segment 服务层（mock generate_with_references / record_asset）：
   - 正常生成返回 done + result_image_url
   - 图片生成异常返回 error，回写节点 error 状态
   - system_prompt 为空时回退默认 STORYBOARD_BOARD_PROMPT
4. batch_generate_segments 服务层：
   - 项目不存在抛 ValueError
   - 正常批量生成返回 done，结果数与请求数一致
   - 单段异常不影响其他段
   - 并发数边界
5. 故事板节点持久化回写
   - 成功回写 status=done + resultImageUrl
   - 失败回写 status=error + error
6. API 端点鉴权与 404
   - 无 token 401
   - 不存在项目 404
   - 项目存在时端点正常调用（mock 服务层）

仿 tests/test_canvas_storyboard.py 模式：内存 SQLite + StaticPool + 每测试重建表。
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.auth.security import hash_password
from src.canvas.models import (
    SegmentGenerateRequest,
    SegmentGenerateResponse,
    SegmentGenerateResult,
    SegmentInput,
)
from src.canvas.persistence import create_project, get_project
from src.canvas.storyboard_service import (
    _generate_single_segment,
    _resolve_segment_references,
    batch_generate_segments,
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
    """每条测试前建表 + 覆盖 get_db，后清理。"""
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


def _make_user(db, username: str = "segment_user") -> User:
    """直接造一个用户行。"""
    user = User(username=username, hashed_password=hash_password("pass123"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, user_id: int, name: str = "测试段级故事板") -> str:
    """直接通过 persistence 创建项目，返回 project_id。"""
    project = create_project(
        db,
        user_id,
        name=name,
        nodes=[],
        edges=[],
        viewport={"x": 0, "y": 0, "zoom": 1},
    )
    return project.id


def _make_segment_node(node_id: str, segment_id: str = "seg1") -> dict[str, Any]:
    """构造一个段级故事板节点（用于回写测试）。"""
    return {
        "id": node_id,
        "type": "segment",
        "position": {"x": 0, "y": 0},
        "data": {
            "kind": "segment",
            "segmentId": segment_id,
            "title": f"片段 {segment_id}",
            "storyboardText": "START FRAME: 农田晨雾\nSHOT GRID: 3x3",
            "systemPrompt": "",
            "status": "idle",
        },
    }


def _client_with_token(username: str = "seg_alice"):
    """注册 + 登录拿 token，返回 (client, token, user_id)。"""
    client = TestClient(app)
    client.post(
        "/api/auth/register", json={"username": username, "password": "pass123456"}
    )
    login_resp = client.post(
        "/api/auth/login", json={"username": username, "password": "pass123456"}
    )
    token = login_resp.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    return client, token, me.json()["id"]


# ============================================================
# 1. Pydantic 模型校验
# ============================================================


def test_segment_input_requires_storyboard_text():
    """storyboard_text 不能为空字符串。"""
    with pytest.raises(Exception):
        SegmentInput(segment_id="s1", storyboard_text="")


def test_segment_input_defaults():
    """默认值：system_prompt=None、title=''、node_id=None。"""
    seg = SegmentInput(segment_id="s1", storyboard_text="START FRAME: ...")
    assert seg.system_prompt is None
    assert seg.title == ""
    assert seg.node_id is None


def test_segment_generate_request_requires_segments():
    """segments 至少 1 个。"""
    with pytest.raises(Exception):
        SegmentGenerateRequest(segments=[])


def test_segment_generate_request_concurrency_bounds():
    """concurrency 必须 1~8。"""
    req = SegmentGenerateRequest(
        segments=[SegmentInput(segment_id="s1", storyboard_text="x")]
    )
    assert req.concurrency == 3  # 默认值

    with pytest.raises(Exception):
        SegmentGenerateRequest(
            segments=[SegmentInput(segment_id="s1", storyboard_text="x")],
            concurrency=0,
        )
    with pytest.raises(Exception):
        SegmentGenerateRequest(
            segments=[SegmentInput(segment_id="s1", storyboard_text="x")],
            concurrency=9,
        )


# ============================================================
# 2. _resolve_segment_references 参考图去空去重
# ============================================================


def test_resolve_segment_references_dedupes():
    """character/object/scene 三类资产去重，保留顺序。"""
    refs = _resolve_segment_references(
        "/outputs/upload/char.jpg",
        "/outputs/upload/obj.jpg",
        "/outputs/upload/char.jpg",  # 与 character 重复
    )
    assert refs == ["/outputs/upload/char.jpg", "/outputs/upload/obj.jpg"]


def test_resolve_segment_references_filters_blank():
    """空白 URL 应被过滤。"""
    refs = _resolve_segment_references("   ", None, "")
    assert refs == []


def test_resolve_segment_references_all_three():
    """三类资产都提供时全部保留。"""
    refs = _resolve_segment_references(
        "/outputs/upload/char.jpg",
        "/outputs/upload/obj.jpg",
        "/outputs/upload/scene.jpg",
    )
    assert refs == [
        "/outputs/upload/char.jpg",
        "/outputs/upload/obj.jpg",
        "/outputs/upload/scene.jpg",
    ]


def test_resolve_segment_references_empty_when_none():
    """全部为 None 时返回空列表（纯文生图）。"""
    assert _resolve_segment_references(None, None, None) == []


# ============================================================
# 3. _generate_single_segment 服务层
# ============================================================


@pytest.mark.asyncio
async def test_generate_single_segment_success(monkeypatch):
    """正常生成：返回 done + result_image_url，回写节点 done 状态。"""
    db = TestSession()
    user = _make_user(db)
    node = _make_segment_node("n1")
    project = create_project(
        db, user.id, name="单段成功", nodes=[node], edges=[], viewport={}
    )

    async def fake_generate(**kwargs):
        return "/outputs/image/seg_result.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    seg = SegmentInput(
        segment_id="seg1",
        storyboard_text="START FRAME: 农田晨雾",
        node_id="n1",
        title="片段 1",
    )
    result = await _generate_single_segment(
        seg,
        character_ref="/outputs/upload/char.jpg",
        object_ref=None,
        scene_ref=None,
        size="1920x1920",
        model=None,
        db=db,
        project_id=project.id,
        user_id=user.id,
    )
    assert result.status == "done"
    assert result.node_id == "n1"
    assert result.result_image_url == "/outputs/image/seg_result.jpg"
    assert result.error is None

    # 验证节点回写
    refreshed = get_project(db, project.id, user.id)
    import json
    nodes = json.loads(refreshed.nodes_json)
    assert nodes[0]["data"]["status"] == "done"
    assert nodes[0]["data"]["resultImageUrl"] == "/outputs/image/seg_result.jpg"


@pytest.mark.asyncio
async def test_generate_single_segment_failure_writes_error(monkeypatch):
    """图片生成异常：返回 error，回写节点 error + error 文案。"""
    db = TestSession()
    user = _make_user(db)
    node = _make_segment_node("n_err")
    project = create_project(
        db, user.id, name="单段失败", nodes=[node], edges=[], viewport={}
    )

    async def fake_generate(**kwargs):
        raise RuntimeError("图片网关超时")

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    seg = SegmentInput(
        segment_id="seg_err",
        storyboard_text="START FRAME: ...",
        node_id="n_err",
    )
    result = await _generate_single_segment(
        seg,
        character_ref=None,
        object_ref=None,
        scene_ref=None,
        size=None,
        model=None,
        db=db,
        project_id=project.id,
        user_id=user.id,
    )
    assert result.status == "error"
    assert "图片网关超时" in result.error

    refreshed = get_project(db, project.id, user.id)
    import json
    nodes = json.loads(refreshed.nodes_json)
    assert nodes[0]["data"]["status"] == "error"
    assert "图片网关超时" in nodes[0]["data"].get("error", "")


@pytest.mark.asyncio
async def test_generate_single_segment_falls_back_to_default_prompt(monkeypatch):
    """system_prompt 为 None 时使用后端默认 STORYBOARD_BOARD_PROMPT。"""
    db = TestSession()
    user = _make_user(db)
    project = create_project(
        db, user.id, name="默认提示词", nodes=[], edges=[], viewport={}
    )

    captured: dict[str, Any] = {}

    async def fake_generate(**kwargs):
        captured["prompt"] = kwargs.get("prompt")
        return "/outputs/image/x.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    seg = SegmentInput(
        segment_id="seg1",
        storyboard_text="START FRAME: ...",
        # system_prompt 不传 → None
    )
    await _generate_single_segment(
        seg,
        character_ref=None,
        object_ref=None,
        scene_ref=None,
        size=None,
        model=None,
        db=db,
        project_id=project.id,
        user_id=user.id,
    )
    # prompt 应包含默认 STORYBOARD_BOARD_PROMPT 关键字 + storyboard_text
    assert "Storyboard Text:" in captured["prompt"]
    assert "START FRAME:" in captured["prompt"]


# ============================================================
# 4. batch_generate_segments 服务层
# ============================================================


@pytest.mark.asyncio
async def test_batch_generate_segments_raises_for_missing_project():
    """项目不存在或无归属时应抛 ValueError。"""
    db = TestSession()
    user = _make_user(db)
    req = SegmentGenerateRequest(
        segments=[SegmentInput(segment_id="s1", storyboard_text="x")]
    )
    with pytest.raises(ValueError):
        await batch_generate_segments(db, "nonexistent-project-id", user, req)


@pytest.mark.asyncio
async def test_batch_generate_segments_success(monkeypatch):
    """正常批量生成：所有段返回 done，结果数与请求数一致。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    async def fake_generate(**kwargs):
        return "/outputs/image/fake_seg.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = SegmentGenerateRequest(
        segments=[
            SegmentInput(
                segment_id=f"seg{i}",
                storyboard_text=f"START FRAME: 段{i}",
                node_id=f"n{i}",
            )
            for i in range(3)
        ],
        character_ref="/outputs/upload/char.jpg",
    )
    result = await batch_generate_segments(db, project_id, user, req)
    assert isinstance(result, SegmentGenerateResponse)
    assert len(result.results) == 3
    assert all(r.status == "done" for r in result.results)
    assert all(
        r.result_image_url == "/outputs/image/fake_seg.jpg" for r in result.results
    )
    # node_id 透传
    assert result.results[0].node_id == "n0"


@pytest.mark.asyncio
async def test_batch_generate_segments_partial_failure(monkeypatch):
    """单段异常不影响其他段：失败段返回 error，成功段返回 done。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    call_count = {"n": 0}

    async def fake_generate(**kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("第二段生成失败")
        return f"/outputs/image/seg_{call_count['n']}.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = SegmentGenerateRequest(
        segments=[
            SegmentInput(
                segment_id=f"seg{i}",
                storyboard_text=f"START FRAME: 段{i}",
                node_id=f"n{i}",
            )
            for i in range(3)
        ],
    )
    result = await batch_generate_segments(db, project_id, user, req)
    statuses = [r.status for r in result.results]
    assert "error" in statuses
    assert "done" in statuses
    err_result = next(r for r in result.results if r.status == "error")
    assert err_result.error and "第二段生成失败" in err_result.error


@pytest.mark.asyncio
async def test_batch_generate_segments_concurrency_limit(monkeypatch):
    """concurrency=1 时图片生成串行（无并发重叠）。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    active = {"cur": 0, "max": 0}

    async def fake_generate(**kwargs):
        active["cur"] += 1
        active["max"] = max(active["max"], active["cur"])
        await asyncio.sleep(0.01)
        active["cur"] -= 1
        return "/outputs/image/x.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = SegmentGenerateRequest(
        segments=[
            SegmentInput(segment_id=f"seg{i}", storyboard_text=f"段{i}")
            for i in range(5)
        ],
        concurrency=1,
    )
    await batch_generate_segments(db, project_id, user, req)
    assert active["max"] == 1, "concurrency=1 应保证串行执行"


@pytest.mark.asyncio
async def test_batch_generate_segments_concurrency_3_allows_overlap(monkeypatch):
    """concurrency=3 时允许最多 3 个并发。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    active = {"cur": 0, "max": 0}

    async def fake_generate(**kwargs):
        active["cur"] += 1
        active["max"] = max(active["max"], active["cur"])
        await asyncio.sleep(0.05)
        active["cur"] -= 1
        return "/outputs/image/x.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = SegmentGenerateRequest(
        segments=[
            SegmentInput(segment_id=f"seg{i}", storyboard_text=f"段{i}")
            for i in range(6)
        ],
        concurrency=3,
    )
    await batch_generate_segments(db, project_id, user, req)
    assert active["max"] >= 2, "concurrency=3 应允许并发重叠"
    assert active["max"] <= 3, "并发不应超过上限 3"


# ============================================================
# 5. 故事板节点持久化回写
# ============================================================


@pytest.mark.asyncio
async def test_batch_generate_segments_writes_back_node_status(monkeypatch):
    """生成成功后 SegmentNode 的 status/resultImageUrl 应被回写到 nodes JSON。"""
    db = TestSession()
    user = _make_user(db)
    seg_node = _make_segment_node("n1", segment_id="seg1")
    project = create_project(
        db, user.id, name="回写测试", nodes=[seg_node], edges=[], viewport={}
    )

    async def fake_generate(**kwargs):
        return "/outputs/image/result.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = SegmentGenerateRequest(
        segments=[
            SegmentInput(
                segment_id="seg1", storyboard_text="START FRAME: ...", node_id="n1"
            )
        ]
    )
    await batch_generate_segments(db, project.id, user, req)

    refreshed = get_project(db, project.id, user.id)
    import json
    nodes = json.loads(refreshed.nodes_json)
    seg_data = nodes[0]["data"]
    assert seg_data["status"] == "done"
    assert seg_data["resultImageUrl"] == "/outputs/image/result.jpg"
    assert seg_data.get("error") is None


@pytest.mark.asyncio
async def test_batch_generate_segments_writes_back_error_status(monkeypatch):
    """生成失败后 SegmentNode 的 status=error + error 字段应被回写。"""
    db = TestSession()
    user = _make_user(db)
    seg_node = _make_segment_node("n_err", segment_id="seg_err")
    project = create_project(
        db, user.id, name="回写错误", nodes=[seg_node], edges=[], viewport={}
    )

    async def fake_generate(**kwargs):
        raise RuntimeError("图片网关超时")

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = SegmentGenerateRequest(
        segments=[
            SegmentInput(
                segment_id="seg_err",
                storyboard_text="START FRAME: ...",
                node_id="n_err",
            )
        ]
    )
    await batch_generate_segments(db, project.id, user, req)

    refreshed = get_project(db, project.id, user.id)
    import json
    nodes = json.loads(refreshed.nodes_json)
    seg_data = nodes[0]["data"]
    assert seg_data["status"] == "error"
    assert "图片网关超时" in seg_data.get("error", "")


# ============================================================
# 6. API 端点鉴权与 404
# ============================================================


def test_segment_generate_endpoint_requires_auth():
    """无 token 调用 segment-generate 应 401。"""
    client = TestClient(app)
    resp = client.post(
        "/api/canvas/projects/any/storyboard/segment-generate",
        json={
            "segments": [
                {"segment_id": "s1", "storyboard_text": "START FRAME: ..."}
            ]
        },
    )
    assert resp.status_code == 401


def test_segment_generate_404_for_missing_project():
    """项目不存在时 segment-generate 返回 404。"""
    client, token, _uid = _client_with_token("seg_404_user")
    resp = client.post(
        "/api/canvas/projects/nonexistent-id/storyboard/segment-generate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "segments": [
                {"segment_id": "s1", "storyboard_text": "START FRAME: ..."}
            ]
        },
    )
    assert resp.status_code == 404


def test_segment_generate_api_success(monkeypatch):
    """端到端：创建项目 → 调 segment-generate（mock 服务层）→ 验证响应结构。"""
    client, token, user_id = _client_with_token("seg_api_user")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. 创建项目
    resp = client.post(
        "/api/canvas/projects",
        headers=headers,
        json={"name": "API测试段级故事板", "nodes": [], "edges": []},
    )
    assert resp.status_code == 200, resp.text
    project_id = resp.json()["id"]

    # 2. mock 服务层返回固定结果
    fake_result = SegmentGenerateResponse(
        results=[
            SegmentGenerateResult(
                node_id="n1", status="done", result_image_url="/outputs/image/x.jpg"
            )
        ]
    )

    async def fake_batch(*args, **kwargs):
        return fake_result

    monkeypatch.setattr("src.canvas.router.batch_generate_segments", fake_batch)

    # 3. 调用端点
    resp = client.post(
        f"/api/canvas/projects/{project_id}/storyboard/segment-generate",
        headers=headers,
        json={
            "segments": [
                {
                    "segment_id": "s1",
                    "storyboard_text": "START FRAME: 农田晨雾",
                    "title": "片段 1",
                    "node_id": "n1",
                }
            ],
            "character_ref": "/outputs/upload/char.jpg",
            "concurrency": 1,
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "results" in data
    assert len(data["results"]) == 1
    assert data["results"][0]["status"] == "done"
    assert data["results"][0]["result_image_url"] == "/outputs/image/x.jpg"
    assert data["results"][0]["node_id"] == "n1"
