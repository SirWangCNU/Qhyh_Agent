"""对话创作 Agent 服务层与 API 测试。

纯单元测试，无需 LLM API key。覆盖：
- run_conversation / run_conversation_stream（mock LLM）
- /chat/sync / /chat（SSE） / /health 端点鉴权与响应
- 用例示范 test_usage_example
"""

from __future__ import annotations

from conversation_helpers import FakeAIMessage, fake_llm_factory, make_tool_call, register_and_login
from fastapi.testclient import TestClient

from src.conversation_agent import (
    ConversationMessage,
    ConversationRequest,
    run_conversation,
    run_conversation_stream,
)
from src.conversation_agent import search as search_mod
from src.conversation_agent import service as service_mod
from src.main import app


def _mock_web_search(monkeypatch):
    """mock web_search 避免真实联网（与 test_conversation_agent.py 的 _run_react 一致）。"""
    monkeypatch.setattr(
        search_mod,
        "web_search",
        lambda q, max_results=None: [{"title": "T", "url": "U", "snippet": "S"}],
    )


# ============================================================
# 服务层测试
# ============================================================


def test_run_conversation_sync(monkeypatch):
    """同步服务应返回完整 ConversationResponse。"""
    _mock_web_search(monkeypatch)
    responses = [
        FakeAIMessage(content="思考", tool_calls=[make_tool_call("web_search", {"query": "大米"})]),
        FakeAIMessage(content="最终方案"),
    ]
    monkeypatch.setattr(service_mod, "get_llm", fake_llm_factory(responses))
    req = ConversationRequest(
        messages=[ConversationMessage(role="user", content="创作大米短视频")]
    )
    resp = run_conversation(req)
    assert resp.answer == "最终方案"
    assert resp.iterations == 2
    event_types = [e.event for e in resp.events]
    assert "think" in event_types
    assert "tool_call" in event_types
    assert "tool_result" in event_types
    assert "answer" in event_types
    assert event_types[-1] == "done"


def test_run_conversation_stream_yields_in_order(monkeypatch):
    """流式生成器应按 think→tool_call→tool_result→answer→done 顺序 yield。"""
    _mock_web_search(monkeypatch)
    responses = [
        FakeAIMessage(content="搜一下", tool_calls=[make_tool_call("web_search", {"query": "x"})]),
        FakeAIMessage(content="答案"),
    ]
    monkeypatch.setattr(service_mod, "get_llm", fake_llm_factory(responses))
    req = ConversationRequest(messages=[ConversationMessage(role="user", content="hi")])
    events = list(run_conversation_stream(req))
    types = [e.event for e in events]
    assert types[0] == "think"
    assert types[-1] == "done"
    assert types[-2] == "answer"
    assert "tool_call" in types and "tool_result" in types


# ============================================================
# API 端点测试
# ============================================================


def test_chat_sync_endpoint_requires_auth():
    """无 token 调 /chat/sync 应返回 401。"""
    client = TestClient(app)
    resp = client.post(
        "/api/conversation/chat/sync",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 401


def test_health_endpoint_requires_auth():
    """无 token 调 /health 应返回 401。"""
    client = TestClient(app)
    assert client.get("/api/conversation/health").status_code == 401


def test_chat_sync_endpoint_with_auth(monkeypatch):
    """带 token 调 /chat/sync，mock LLM 后应返回 200 + 完整响应。"""
    responses = [FakeAIMessage(content="直接回答，无需工具")]
    monkeypatch.setattr(service_mod, "get_llm", fake_llm_factory(responses))
    client = TestClient(app)
    token = register_and_login(client)
    resp = client.post(
        "/api/conversation/chat/sync",
        headers={"Authorization": f"Bearer {token}"},
        json={"messages": [{"role": "user", "content": "你好"}]},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["answer"] == "直接回答，无需工具"
    assert data["iterations"] == 1
    assert isinstance(data["events"], list)


def test_chat_stream_endpoint_sse(monkeypatch):
    """带 token 调 /chat（SSE），应返回 text/event-stream 且含事件。"""
    responses = [FakeAIMessage(content="流式答案")]
    monkeypatch.setattr(service_mod, "get_llm", fake_llm_factory(responses))
    client = TestClient(app)
    token = register_and_login(client, "streamuser", "streampass123")
    with client.stream(
        "POST",
        "/api/conversation/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"messages": [{"role": "user", "content": "hi"}]},
    ) as resp:
        assert resp.status_code == 200
        body = "".join(resp.iter_text())
        assert "answer" in body
        assert "流式答案" in body
        assert "done" in body


# ============================================================
# 用例示范（用户要求：附带简单用例测试）
# ============================================================


def test_usage_example(monkeypatch, capsys):
    """用例示范：展示如何通过 run_conversation() 直接调用 agent（mock LLM）。

    真实使用时只需移除 monkeypatch，配置 LLM_API_KEY 即可。
    """
    _mock_web_search(monkeypatch)
    responses = [
        FakeAIMessage(
            content="我先搜索五常大米的市场行情",
            tool_calls=[make_tool_call("web_search", {"query": "五常大米 价格 2026"})],
        ),
        FakeAIMessage(content="基于搜索结果，五常大米短视频创作方案如下：..."),
    ]
    monkeypatch.setattr(service_mod, "get_llm", fake_llm_factory(responses))

    resp = run_conversation(
        ConversationRequest(
            messages=[
                ConversationMessage(role="user", content="帮我创作一个关于五常大米的农业短视频")
            ]
        )
    )
    print(f"\n[用例] 最终回答: {resp.answer}")
    print(f"[用例] 迭代次数: {resp.iterations}")
    print(f"[用例] 事件数: {len(resp.events)}")
    for ev in resp.events:
        print(f"[用例] 事件: {ev.event} -> {ev.data}")

    assert resp.answer
    assert resp.iterations == 2
    assert len(resp.events) >= 4  # think + tool_call + tool_result + answer + done
