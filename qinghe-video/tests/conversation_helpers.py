"""对话创作 Agent 测试共享设施。

提供 FakeLLM / FakeDDGS / FakeGraph 等 mock 对象与辅助函数，
供 test_conversation_agent.py 与 test_conversation_agent_api.py 复用。
"""

from __future__ import annotations

from fastapi.testclient import TestClient


# ============================================================
# Fake LLM（模拟 ChatOpenAI 的 bind_tools + invoke）
# ============================================================


class FakeAIMessage:
    """模拟 langchain AIMessage（含 content + tool_calls）。"""

    def __init__(self, content: str = "", tool_calls: list[dict] | None = None):
        self.content = content
        self.tool_calls = tool_calls or []


class FakeChatModel:
    """模拟 ChatOpenAI，按预设序列返回 AIMessage。

    bind_tools 返回 self（忽略 schema）；invoke 按序弹出下一个预设响应。
    """

    def __init__(self, responses: list[FakeAIMessage]):
        self.responses = list(responses)
        self._index = 0

    def bind_tools(self, tools_schema: list[dict]) -> "FakeChatModel":
        return self

    def invoke(self, messages: list) -> FakeAIMessage:
        if self._index >= len(self.responses):
            # 耗尽时重复最后一个响应（用于测试 max_iterations 强制终止场景）；
            # 若无任何预设则返回无工具调用的终止消息，防止无限循环
            if self.responses:
                return self.responses[-1]
            return FakeAIMessage(content="（测试：预设响应耗尽）")
        resp = self.responses[self._index]
        self._index += 1
        return resp


def make_tool_call(name: str, args: dict, call_id: str = "call_1") -> dict:
    """构造 LangChain 风格的 tool_call dict。"""
    return {"name": name, "args": args, "id": call_id, "type": "tool_call"}


def fake_llm_factory(responses: list[FakeAIMessage]):
    """返回一个工厂函数，用于 monkeypatch service.get_llm。"""
    return lambda **kw: FakeChatModel(responses)


# ============================================================
# Fake 外部依赖
# ============================================================


class FakeDDGS:
    """模拟 duckduckgo_search.DDGS（既可被 DDGS() 调用，又可作为上下文管理器）。"""

    def __init__(self, items: list[dict]):
        self._items = items

    def __call__(self):
        # 支持 search.py 中 `with DDGS() as ddgs:` 的调用形式
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def text(self, query: str, max_results: int = 5):
        return iter(self._items)


class BrokenDDGS(FakeDDGS):
    """模拟搜索异常。"""

    def text(self, *a, **kw):
        raise RuntimeError("网络错误")


class FakeGraph:
    """模拟 src.graph.app_graph（仅实现 invoke）。"""

    def __init__(self, state: dict):
        self._state = state

    def invoke(self, state: dict) -> dict:
        return self._state


# ============================================================
# API 测试辅助
# ============================================================


def register_and_login(
    client: TestClient, username: str = "convuser", password: str = "convpass123"
) -> str:
    """注册并登录，返回 access_token。"""
    client.post("/api/auth/register", json={"username": username, "password": password})
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]
