"""对话创作 Agent 工具层与 ReAct 循环测试。

纯单元测试，无需 LLM API key。覆盖：
- web_search / run_pipeline / mock media / execute_tool / schemas
- ReAct 循环（mock LLM tool_calls 序列：单工具、多工具、最大迭代、工具失败）
"""

from __future__ import annotations

from conversation_helpers import (
    FakeAIMessage,
    FakeChatModel,
    FakeDDGS,
    FakeGraph,
    make_tool_call,
)

from src.conversation_agent import media_tools as media_mod
from src.conversation_agent import pipeline_tool as pipeline_mod
from src.conversation_agent import search as search_mod
from src.conversation_agent import tools as tools_mod
from src.conversation_agent.react_agent import react_loop


# ============================================================
# 工具层测试
# ============================================================


def test_web_search_returns_results(monkeypatch):
    """web_search 应返回格式化结果列表。"""
    items = [{"title": "大米行情", "href": "http://x.com/1", "body": "价格上涨"}]
    monkeypatch.setattr(search_mod, "HAS_DDGS", True)
    monkeypatch.setattr(search_mod, "DDGS", FakeDDGS(items))
    results = search_mod.web_search("大米")
    assert len(results) == 1
    assert results[0]["title"] == "大米行情"
    assert results[0]["url"] == "http://x.com/1"
    assert results[0]["snippet"] == "价格上涨"


def test_web_search_handles_error(monkeypatch):
    """搜索异常时应返回空列表，不抛错。"""
    from conversation_helpers import BrokenDDGS

    monkeypatch.setattr(search_mod, "HAS_DDGS", True)
    monkeypatch.setattr(search_mod, "DDGS", BrokenDDGS([]))
    assert search_mod.web_search("任意") == []


def test_web_search_tool_func_formats_output(monkeypatch):
    """web_search_tool_func 应返回含标题/摘要/链接的格式化字符串。"""
    items = [{"title": "T1", "href": "http://u", "body": "B1"}]
    monkeypatch.setattr(search_mod, "HAS_DDGS", True)
    monkeypatch.setattr(search_mod, "DDGS", FakeDDGS(items))
    out = search_mod.web_search_tool_func("q")
    assert "T1" in out and "B1" in out and "http://u" in out


def test_run_pipeline_success(monkeypatch):
    """流水线返回 final_report 时，工具函数应返回报告。"""
    monkeypatch.setattr("src.graph.app_graph", FakeGraph({"final_report": "# 报告\n正文"}))
    out = pipeline_mod.run_pipeline_tool_func(product_name="五常大米")
    assert "报告" in out and "正文" in out


def test_run_pipeline_error(monkeypatch):
    """流水线返回 error 时，工具函数应返回错误信息。"""
    monkeypatch.setattr("src.graph.app_graph", FakeGraph({"error": "节点失败"}))
    out = pipeline_mod.run_pipeline_tool_func(product_name="X")
    assert "节点失败" in out


def test_mock_media_tools_return_placeholder():
    """3 个 mock 工具应返回含 mock 标记和 url 的占位字符串。"""
    img = media_mod.generate_image_tool_func(prompt="稻田")
    vid = media_mod.generate_video_tool_func(prompt="收割", duration=10)
    tts = media_mod.generate_tts_tool_func(text="你好世界")
    assert "[mock]" in img and "/outputs/image/" in img
    assert "[mock]" in vid and "10" in vid and "/outputs/video/" in vid
    assert "[mock]" in tts and "/outputs/audio/" in tts


def test_execute_tool_dispatch_success():
    """execute_tool 应正确分发到对应工具函数。"""
    result = tools_mod.execute_tool("generate_image", {"prompt": "稻田"})
    assert result.success is True
    assert result.name == "generate_image"
    assert "mock" in result.output


def test_execute_tool_unknown_returns_failure():
    """未知工具应返回 success=False。"""
    result = tools_mod.execute_tool("not_exist", {})
    assert result.success is False
    assert "未知工具" in result.output


def test_get_tool_schemas_format():
    """5 个 schema 应含 name/description/parameters 且结构正确。"""
    schemas = tools_mod.get_tool_schemas()
    assert len(schemas) == 5
    names = {s["function"]["name"] for s in schemas}
    assert names == {
        "web_search", "run_pipeline", "generate_image", "generate_video", "generate_tts",
    }
    for s in schemas:
        assert "description" in s["function"]
        assert s["function"]["parameters"]["type"] == "object"


# ============================================================
# ReAct 循环测试
# ============================================================


def _run_react(responses, max_iter=5, monkeypatch=None):
    """辅助：用 FakeChatModel 跑 react_loop 并返回事件列表。

    若传入 monkeypatch，则 mock web_search 避免真实联网（用于触发 web_search 工具的测试）。
    """
    from langchain_core.messages import HumanMessage

    if monkeypatch is not None:
        monkeypatch.setattr(
            search_mod, "web_search", lambda q, max_results=None: [{"title": "T", "url": "U", "snippet": "S"}]
        )
    llm = FakeChatModel(responses)
    return list(react_loop(llm, [HumanMessage(content="hi")], tools_mod.get_tool_schemas(), max_iter))


def test_react_loop_single_tool_then_answer(monkeypatch):
    """第1次返回 tool_call，第2次返回纯文本答案 → 循环 2 次终止。"""
    events = _run_react(
        [
            FakeAIMessage(content="我先搜一下", tool_calls=[make_tool_call("web_search", {"query": "大米"})]),
            FakeAIMessage(content="这是最终答案"),
        ],
        monkeypatch=monkeypatch,
    )
    types = [e["type"] for e in events]
    assert "think" in types and "tool_call" in types and "tool_result" in types
    final = events[-1]
    assert final["type"] == "final"
    assert final["answer"] == "这是最终答案"
    assert final["iterations"] == 2


def test_react_loop_multi_tools_in_one_turn():
    """单轮返回 2 个 tool_calls → 2 个工具都执行。"""
    events = _run_react(
        [
            FakeAIMessage(
                content="同时生图和配音",
                tool_calls=[
                    make_tool_call("generate_image", {"prompt": "稻田"}, "c1"),
                    make_tool_call("generate_tts", {"text": "旁白"}, "c2"),
                ],
            ),
            FakeAIMessage(content="完成"),
        ]
    )
    tool_calls = [e for e in events if e["type"] == "tool_call"]
    tool_results = [e for e in events if e["type"] == "tool_result"]
    assert len(tool_calls) == 2
    assert len(tool_results) == 2
    assert tool_calls[0]["name"] == "generate_image"
    assert tool_calls[1]["name"] == "generate_tts"
    assert all(r["success"] for r in tool_results)


def test_react_loop_max_iterations_terminates(monkeypatch):
    """LLM 永远返回 tool_call → 达到 max_iterations 强制终止。"""
    events = _run_react(
        [FakeAIMessage(content="继续搜", tool_calls=[make_tool_call("web_search", {"query": "x"})])],
        max_iter=2,
        monkeypatch=monkeypatch,
    )
    final = events[-1]
    assert final["type"] == "final"
    assert final["iterations"] == 2
    assert "最大迭代" in final["answer"]


def test_react_loop_tool_failure_continues():
    """工具失败（未知工具）应写回错误信息，循环继续。"""
    events = _run_react(
        [
            FakeAIMessage(content="调未知工具", tool_calls=[make_tool_call("not_a_tool", {})]),
            FakeAIMessage(content="工具失败了，我直接回答"),
        ]
    )
    tool_results = [e for e in events if e["type"] == "tool_result"]
    assert len(tool_results) == 1
    assert tool_results[0]["success"] is False
    assert events[-1]["type"] == "final"
    assert events[-1]["answer"] == "工具失败了，我直接回答"
