"""画布故事板（Storyboard）模块测试。

覆盖：
1. Pydantic 模型校验（ShotInput / StoryboardGenerateRequest / ShotResultInput / StoryboardComposeRequest）
2. _resolve_shot_reference 参考图优先级（shot.url → 按 reference_type 回退 → character_ref 兜底 → 空）
3. _build_voiceover_text 旁白优先级（voiceover_text 优先 → shot narration 拼接）
4. batch_generate_shots 服务层（mock generate_with_references / record_asset）：
   - 项目不存在抛 ValueError
   - 正常批量生成返回 done
   - 单镜异常不影响其他镜
   - 并发数参数边界
5. compose_storyboard_video 服务层（mock _synthesize_async / compose_video / record_asset）：
   - 正常合成返回 success + video_url + audio_url
   - 空图片列表返回 error
   - 空旁白返回 error
   - TTS 失败返回 error
   - 视频合成失败返回 error
6. API 端点鉴权与 404：
   - 无 token 401
   - 不存在的项目 404
   - 项目存在时端点正常调用（mock 服务层）

仿 tests/test_assets.py 模式：内存 SQLite + StaticPool + 每测试重建表。
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
    GenerateResult,
    ShotInput,
    ShotResultInput,
    StoryboardComposeRequest,
    StoryboardComposeResult,
    StoryboardGenerateRequest,
    StoryboardGenerateResult,
)
from src.canvas.persistence import create_project
from src.canvas.storyboard_service import (
    _build_voiceover_text,
    _resolve_shot_reference,
    batch_generate_shots,
    compose_storyboard_video,
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


def _make_user(db, username: str = "storyboard_user") -> User:
    """直接造一个用户行。"""
    user = User(username=username, hashed_password=hash_password("pass123"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_project(db, user_id: int, name: str = "测试故事板") -> str:
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


def _client_with_token(username: str = "sb_alice"):
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


def test_shot_input_requires_visual_prompt():
    """visual_prompt 不能为空字符串。"""
    with pytest.raises(Exception):
        ShotInput(shot_id="s1", visual_prompt="")


def test_shot_input_defaults():
    """默认值：title='', duration=3.5, narration='', reference_image_url=None。"""
    shot = ShotInput(shot_id="s1", visual_prompt="画面描述")
    assert shot.title == ""
    assert shot.narration == ""
    assert shot.duration == 3.5
    assert shot.reference_image_url is None
    assert shot.reference_type is None
    assert shot.node_id is None


def test_shot_input_duration_min():
    """duration 必须 >= 0.1。"""
    with pytest.raises(Exception):
        ShotInput(shot_id="s1", visual_prompt="x", duration=0.0)


def test_storyboard_generate_request_requires_shots():
    """shots 至少 1 个。"""
    with pytest.raises(Exception):
        StoryboardGenerateRequest(shots=[])


def test_storyboard_generate_request_concurrency_bounds():
    """concurrency 必须 1~8。"""
    req = StoryboardGenerateRequest(
        shots=[ShotInput(shot_id="s1", visual_prompt="x")]
    )
    assert req.concurrency == 3  # 默认值

    with pytest.raises(Exception):
        StoryboardGenerateRequest(
            shots=[ShotInput(shot_id="s1", visual_prompt="x")], concurrency=0
        )
    with pytest.raises(Exception):
        StoryboardGenerateRequest(
            shots=[ShotInput(shot_id="s1", visual_prompt="x")], concurrency=9
        )


def test_shot_result_input_requires_image_url():
    """image_url 字段必填（缺省时 ValidationError，空字符串由服务层过滤）。"""
    # 缺省 image_url 应抛 ValidationError
    with pytest.raises(Exception):
        ShotResultInput(shot_id="s1")
    # 空字符串在模型层是允许的（服务层 compose_storyboard_video 会过滤）
    empty = ShotResultInput(shot_id="s1", image_url="")
    assert empty.image_url == ""


def test_storyboard_compose_request_requires_shots():
    """shot_results 至少 1 个。"""
    with pytest.raises(Exception):
        StoryboardComposeRequest(shot_results=[])


# ============================================================
# 2. _resolve_shot_reference 参考图优先级
# ============================================================


def test_resolve_reference_prefers_shot_url():
    """shot.reference_image_url 优先于所有回退。"""
    shot = ShotInput(
        shot_id="s1",
        visual_prompt="x",
        reference_image_url="/outputs/upload/shot.jpg",
        reference_type="character",
    )
    refs = _resolve_shot_reference(
        shot,
        character_ref="/outputs/upload/char.jpg",
        object_ref="/outputs/upload/obj.jpg",
        scene_ref="/outputs/upload/scene.jpg",
    )
    assert refs == ["/outputs/upload/shot.jpg"]


def test_resolve_reference_falls_back_by_type_character():
    """无 shot.url 时按 reference_type=character 回退。"""
    shot = ShotInput(
        shot_id="s1", visual_prompt="x", reference_type="character"
    )
    refs = _resolve_shot_reference(
        shot,
        character_ref="/outputs/upload/char.jpg",
        object_ref="/outputs/upload/obj.jpg",
        scene_ref="/outputs/upload/scene.jpg",
    )
    assert refs == ["/outputs/upload/char.jpg"]


def test_resolve_reference_falls_back_by_type_object():
    """reference_type=object 回退到 object_ref。"""
    shot = ShotInput(shot_id="s1", visual_prompt="x", reference_type="object")
    refs = _resolve_shot_reference(
        shot,
        character_ref="/outputs/upload/char.jpg",
        object_ref="/outputs/upload/obj.jpg",
        scene_ref=None,
    )
    assert refs == ["/outputs/upload/obj.jpg"]


def test_resolve_reference_falls_back_by_type_scene():
    """reference_type=scene 回退到 scene_ref。"""
    shot = ShotInput(shot_id="s1", visual_prompt="x", reference_type="scene")
    refs = _resolve_shot_reference(
        shot,
        character_ref=None,
        object_ref=None,
        scene_ref="/outputs/upload/scene.jpg",
    )
    assert refs == ["/outputs/upload/scene.jpg"]


def test_resolve_reference_default_character_when_no_type():
    """无 reference_type 时默认使用 character_ref（最常见的主体一致性需求）。"""
    shot = ShotInput(shot_id="s1", visual_prompt="x")
    refs = _resolve_shot_reference(
        shot,
        character_ref="/outputs/upload/char.jpg",
        object_ref=None,
        scene_ref=None,
    )
    assert refs == ["/outputs/upload/char.jpg"]


def test_resolve_reference_empty_when_nothing_available():
    """没有任何参考图时返回空列表（纯文生图）。"""
    shot = ShotInput(shot_id="s1", visual_prompt="x")
    refs = _resolve_shot_reference(shot, None, None, None)
    assert refs == []


def test_resolve_reference_ignores_blank_url():
    """空白 URL 应被过滤。"""
    shot = ShotInput(
        shot_id="s1", visual_prompt="x", reference_image_url="   "
    )
    refs = _resolve_shot_reference(shot, None, None, None)
    assert refs == []


def test_resolve_reference_ignores_blank_fallback():
    """回退 URL 为空白时应继续往下找，最终返回空。"""
    shot = ShotInput(
        shot_id="s1", visual_prompt="x", reference_type="character"
    )
    refs = _resolve_shot_reference(
        shot, character_ref="   ", object_ref=None, scene_ref=None
    )
    assert refs == []


# ============================================================
# 3. _build_voiceover_text 旁白优先级
# ============================================================


def test_build_voiceover_prefers_explicit_text():
    """voiceover_text 优先于 shot narration 拼接。"""
    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="u1", narration="镜1旁白"),
            ShotResultInput(shot_id="s2", image_url="u2", narration="镜2旁白"),
        ],
        voiceover_text="整体旁白文本",
    )
    assert _build_voiceover_text(req) == "整体旁白文本"


def test_build_voiceover_joins_narrations_when_no_explicit():
    """无 voiceover_text 时按 shot 顺序拼接 narration。"""
    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="u1", narration="镜1旁白"),
            ShotResultInput(shot_id="s2", image_url="u2", narration="镜2旁白"),
        ],
    )
    text = _build_voiceover_text(req)
    assert "镜1旁白" in text
    assert "镜2旁白" in text
    assert "\n" in text


def test_build_voiceover_skips_empty_narrations():
    """空 narration 不参与拼接。"""
    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="u1", narration=""),
            ShotResultInput(shot_id="s2", image_url="u2", narration="镜2旁白"),
            ShotResultInput(shot_id="s3", image_url="u3", narration="   "),
        ],
    )
    assert _build_voiceover_text(req) == "镜2旁白"


def test_build_voiceover_empty_when_all_blank():
    """全部空时返回空字符串。"""
    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="u1", narration=""),
        ],
    )
    assert _build_voiceover_text(req) == ""


# ============================================================
# 4. batch_generate_shots 服务层
# ============================================================


@pytest.mark.asyncio
async def test_batch_generate_raises_for_missing_project():
    """项目不存在或无归属时应抛 ValueError。"""
    db = TestSession()
    user = _make_user(db)
    req = StoryboardGenerateRequest(
        shots=[ShotInput(shot_id="s1", visual_prompt="x")]
    )
    with pytest.raises(ValueError):
        await batch_generate_shots(db, "nonexistent-project-id", user, req)


@pytest.mark.asyncio
async def test_batch_generate_success(monkeypatch):
    """正常批量生成：所有分镜返回 done，结果数与请求数一致。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    # mock 图片生成与资产落库
    async def fake_generate(**kwargs):
        return "/outputs/image/fake_shot.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = StoryboardGenerateRequest(
        shots=[
            ShotInput(shot_id=f"s{i}", visual_prompt=f"画面{i}", node_id=f"n{i}")
            for i in range(3)
        ],
        character_ref="/outputs/upload/char.jpg",
    )
    result = await batch_generate_shots(db, project_id, user, req)
    assert isinstance(result, StoryboardGenerateResult)
    assert len(result.results) == 3
    assert all(r.status == "done" for r in result.results)
    assert all(r.result_image_url == "/outputs/image/fake_shot.jpg" for r in result.results)
    # node_id 透传
    assert result.results[0].node_id == "n0"


@pytest.mark.asyncio
async def test_batch_generate_partial_failure(monkeypatch):
    """单镜异常不影响其他镜：失败镜返回 error，成功镜返回 done。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    call_count = {"n": 0}

    async def fake_generate(**kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("第二镜生成失败")
        return f"/outputs/image/shot_{call_count['n']}.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = StoryboardGenerateRequest(
        shots=[
            ShotInput(shot_id=f"s{i}", visual_prompt=f"画面{i}", node_id=f"n{i}")
            for i in range(3)
        ],
    )
    result = await batch_generate_shots(db, project_id, user, req)
    statuses = [r.status for r in result.results]
    assert "error" in statuses
    assert "done" in statuses
    # 失败镜的 error 字段非空
    err_result = next(r for r in result.results if r.status == "error")
    assert err_result.error and "第二镜生成失败" in err_result.error


@pytest.mark.asyncio
async def test_batch_generate_concurrency_limit(monkeypatch):
    """并发数参数生效：concurrency=1 时图片生成串行（无并发重叠）。"""
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

    req = StoryboardGenerateRequest(
        shots=[
            ShotInput(shot_id=f"s{i}", visual_prompt=f"画面{i}")
            for i in range(5)
        ],
        concurrency=1,
    )
    await batch_generate_shots(db, project_id, user, req)
    assert active["max"] == 1, "concurrency=1 应保证串行执行"


@pytest.mark.asyncio
async def test_batch_generate_concurrency_3_allows_overlap(monkeypatch):
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

    req = StoryboardGenerateRequest(
        shots=[
            ShotInput(shot_id=f"s{i}", visual_prompt=f"画面{i}")
            for i in range(6)
        ],
        concurrency=3,
    )
    await batch_generate_shots(db, project_id, user, req)
    assert active["max"] >= 2, "concurrency=3 应允许并发重叠"
    assert active["max"] <= 3, "并发不应超过上限 3"


# ============================================================
# 5. compose_storyboard_video 服务层
# ============================================================


@pytest.mark.asyncio
async def test_compose_raises_for_missing_project():
    """项目不存在时抛 ValueError。"""
    db = TestSession()
    user = _make_user(db)
    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="/outputs/image/x.jpg")
        ],
        voiceover_text="旁白",
    )
    with pytest.raises(ValueError):
        await compose_storyboard_video(db, "nonexistent", user, req)


@pytest.mark.asyncio
async def test_compose_empty_images_returns_error(monkeypatch):
    """空图片列表（image_url 全空）应返回 error。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="", narration="旁白"),
        ],
        voiceover_text="整体旁白",
    )
    result = await compose_storyboard_video(db, project_id, user, req)
    assert result.status == "error"
    assert "没有可合成" in result.error


@pytest.mark.asyncio
async def test_compose_empty_voiceover_returns_error(monkeypatch):
    """无旁白文本应返回 error。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="/outputs/image/x.jpg", narration=""),
        ],
        # 不传 voiceover_text
    )
    result = await compose_storyboard_video(db, project_id, user, req)
    assert result.status == "error"
    assert "旁白" in result.error


@pytest.mark.asyncio
async def test_compose_tts_failure_returns_error(monkeypatch):
    """TTS 合成失败应返回 error 且不调用 video_compose。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    async def fake_tts(text, output_path):
        raise RuntimeError("edge-tts 网络错误")

    compose_called = {"v": False}

    def fake_compose(image_urls, audio_path, output_path):
        compose_called["v"] = True
        return output_path

    monkeypatch.setattr(
        "src.canvas.storyboard_service._synthesize_async", fake_tts
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.compose_video", fake_compose
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="/outputs/image/x.jpg"),
        ],
        voiceover_text="整体旁白",
    )
    result = await compose_storyboard_video(db, project_id, user, req)
    assert result.status == "error"
    assert "TTS" in result.error
    assert compose_called["v"] is False


@pytest.mark.asyncio
async def test_compose_video_failure_returns_error(monkeypatch):
    """视频合成失败应返回 error。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    async def fake_tts(text, output_path):
        return output_path

    def fake_compose(image_urls, audio_path, output_path):
        raise RuntimeError("moviepy 编码失败")

    monkeypatch.setattr(
        "src.canvas.storyboard_service._synthesize_async", fake_tts
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.compose_video", fake_compose
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(shot_id="s1", image_url="/outputs/image/x.jpg"),
        ],
        voiceover_text="整体旁白",
    )
    result = await compose_storyboard_video(db, project_id, user, req)
    assert result.status == "error"
    assert "视频合成" in result.error


@pytest.mark.asyncio
async def test_compose_success(monkeypatch):
    """正常合成：TTS + 视频 + 资产落库 → 返回 success + video_url + audio_url。"""
    db = TestSession()
    user = _make_user(db)
    project_id = _make_project(db, user.id)

    async def fake_tts(text, output_path):
        # 模拟写出音频文件
        from pathlib import Path
        Path(output_path).write_bytes(b"fake mp3")
        return output_path

    def fake_compose(image_urls, audio_path, output_path):
        from pathlib import Path
        Path(output_path).write_bytes(b"fake mp4")
        return output_path

    record_calls: list[dict[str, Any]] = []

    def fake_record(db, user_id, *, source, media_type, url, file_path, **kw):
        record_calls.append(
            {"source": source, "media_type": media_type, "url": url}
        )
        return None

    monkeypatch.setattr(
        "src.canvas.storyboard_service._synthesize_async", fake_tts
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.compose_video", fake_compose
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", fake_record
    )

    req = StoryboardComposeRequest(
        shot_results=[
            ShotResultInput(
                shot_id="s1",
                image_url="/outputs/image/x1.jpg",
                narration="镜1旁白",
                duration=3.5,
            ),
            ShotResultInput(
                shot_id="s2",
                image_url="/outputs/image/x2.jpg",
                narration="镜2旁白",
                duration=4.0,
            ),
        ],
        voiceover_text="整体旁白文本",
    )
    result = await compose_storyboard_video(db, project_id, user, req)

    assert result.status == "success"
    assert result.video_url and result.video_url.startswith("/outputs/video/")
    assert result.audio_url and result.audio_url.startswith("/outputs/audio/")
    # 资产落库：1 视频 + 1 音频
    sources = [c["source"] for c in record_calls]
    assert "video_compose" in sources
    assert "tts" in sources


# ============================================================
# 6. API 端点鉴权与 404
# ============================================================


def test_storyboard_generate_endpoint_requires_auth():
    """无 token 调用 storyboard/generate 应 401。"""
    client = TestClient(app)
    resp = client.post(
        "/api/canvas/projects/any/storyboard/generate",
        json={"shots": [{"shot_id": "s1", "visual_prompt": "x"}]},
    )
    assert resp.status_code == 401


def test_storyboard_compose_endpoint_requires_auth():
    """无 token 调用 storyboard/compose 应 401。"""
    client = TestClient(app)
    resp = client.post(
        "/api/canvas/projects/any/storyboard/compose",
        json={
            "shot_results": [
                {"shot_id": "s1", "image_url": "u", "narration": "n"}
            ]
        },
    )
    assert resp.status_code == 401


def test_storyboard_generate_404_for_missing_project():
    """项目不存在时 storyboard/generate 返回 404。"""
    client, token, _uid = _client_with_token("sb_404_user")
    resp = client.post(
        "/api/canvas/projects/nonexistent-id/storyboard/generate",
        headers={"Authorization": f"Bearer {token}"},
        json={"shots": [{"shot_id": "s1", "visual_prompt": "x"}]},
    )
    assert resp.status_code == 404


def test_storyboard_compose_404_for_missing_project():
    """项目不存在时 storyboard/compose 返回 404。"""
    client, token, _uid = _client_with_token("sb_compose_404")
    resp = client.post(
        "/api/canvas/projects/nonexistent-id/storyboard/compose",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "shot_results": [
                {"shot_id": "s1", "image_url": "u", "narration": "n"}
            ],
            "voiceover_text": "x",
        },
    )
    assert resp.status_code == 404


def test_storyboard_generate_api_success(monkeypatch):
    """端到端：创建项目 → 调 storyboard/generate（mock 服务层）→ 验证响应结构。"""
    client, token, user_id = _client_with_token("sb_api_user")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. 创建项目
    resp = client.post(
        "/api/canvas/projects",
        headers=headers,
        json={"name": "API测试故事板", "nodes": [], "edges": []},
    )
    assert resp.status_code == 200, resp.text
    project_id = resp.json()["id"]

    # 2. mock 服务层返回固定结果
    fake_result = StoryboardGenerateResult(
        results=[
            GenerateResult(
                node_id="n1", status="done", result_image_url="/outputs/image/x.jpg"
            )
        ]
    )

    async def fake_batch(*args, **kwargs):
        return fake_result

    monkeypatch.setattr(
        "src.canvas.router.batch_generate_shots", fake_batch
    )

    # 3. 调用端点
    resp = client.post(
        f"/api/canvas/projects/{project_id}/storyboard/generate",
        headers=headers,
        json={
            "shots": [
                {
                    "shot_id": "s1",
                    "visual_prompt": "画面描述",
                    "narration": "旁白",
                    "duration": 3.5,
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


def test_storyboard_compose_api_success(monkeypatch):
    """端到端：创建项目 → 调 storyboard/compose（mock 服务层）→ 验证响应结构。"""
    client, token, user_id = _client_with_token("sb_compose_api")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. 创建项目
    resp = client.post(
        "/api/canvas/projects",
        headers=headers,
        json={"name": "API合成测试", "nodes": [], "edges": []},
    )
    project_id = resp.json()["id"]

    # 2. mock 服务层
    fake_result = StoryboardComposeResult(
        status="success",
        video_url="/outputs/video/fake.mp4",
        audio_url="/outputs/audio/fake.mp3",
    )

    async def fake_compose(*args, **kwargs):
        return fake_result

    monkeypatch.setattr(
        "src.canvas.router.compose_storyboard_video", fake_compose
    )

    # 3. 调用端点
    resp = client.post(
        f"/api/canvas/projects/{project_id}/storyboard/compose",
        headers=headers,
        json={
            "shot_results": [
                {
                    "shot_id": "s1",
                    "image_url": "/outputs/image/x.jpg",
                    "narration": "旁白",
                    "duration": 3.5,
                }
            ],
            "voiceover_text": "整体旁白",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    assert data["video_url"] == "/outputs/video/fake.mp4"
    assert data["audio_url"] == "/outputs/audio/fake.mp3"


# ============================================================
# 7. 故事板节点持久化回写
# ============================================================


@pytest.mark.asyncio
async def test_batch_generate_writes_back_node_status(monkeypatch):
    """生成成功后 ShotNode 的 status/resultImageUrl 应被回写到 nodes JSON。"""
    from src.canvas.persistence import get_project

    db = TestSession()
    user = _make_user(db)
    # 创建带 1 个 ShotNode 的项目
    shot_node = {
        "id": "n1",
        "type": "shot",
        "position": {"x": 0, "y": 0},
        "data": {
            "kind": "shot",
            "shotId": "s1",
            "title": "分镜 1",
            "visualPrompt": "画面",
            "narration": "旁白",
            "duration": 3.5,
            "status": "idle",
        },
    }
    project = create_project(
        db, user.id, name="回写测试", nodes=[shot_node], edges=[], viewport={}
    )

    async def fake_generate(**kwargs):
        return "/outputs/image/result.jpg"

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = StoryboardGenerateRequest(
        shots=[ShotInput(shot_id="s1", visual_prompt="画面", node_id="n1")]
    )
    await batch_generate_shots(db, project.id, user, req)

    # 从 DB 重新读取，验证回写
    refreshed = get_project(db, project.id, user.id)
    import json
    nodes = json.loads(refreshed.nodes_json)
    shot_data = nodes[0]["data"]
    assert shot_data["status"] == "done"
    assert shot_data["resultImageUrl"] == "/outputs/image/result.jpg"
    assert shot_data.get("error") is None


@pytest.mark.asyncio
async def test_batch_generate_writes_back_error_status(monkeypatch):
    """生成失败后 ShotNode 的 status=error + error 字段应被回写。"""
    from src.canvas.persistence import get_project

    db = TestSession()
    user = _make_user(db)
    shot_node = {
        "id": "n_err",
        "type": "shot",
        "position": {"x": 0, "y": 0},
        "data": {
            "kind": "shot",
            "shotId": "s_err",
            "title": "失败镜",
            "visualPrompt": "画面",
            "narration": "",
            "duration": 3.5,
            "status": "idle",
        },
    }
    project = create_project(
        db, user.id, name="回写错误", nodes=[shot_node], edges=[], viewport={}
    )

    async def fake_generate(**kwargs):
        raise RuntimeError("图片网关超时")

    monkeypatch.setattr(
        "src.canvas.storyboard_service.generate_with_references", fake_generate
    )
    monkeypatch.setattr(
        "src.canvas.storyboard_service.record_asset", lambda *a, **kw: None
    )

    req = StoryboardGenerateRequest(
        shots=[ShotInput(shot_id="s_err", visual_prompt="画面", node_id="n_err")]
    )
    await batch_generate_shots(db, project.id, user, req)

    refreshed = get_project(db, project.id, user.id)
    import json
    nodes = json.loads(refreshed.nodes_json)
    shot_data = nodes[0]["data"]
    assert shot_data["status"] == "error"
    assert "图片网关超时" in shot_data.get("error", "")
