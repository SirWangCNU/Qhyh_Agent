# 对话创作 Agent 模块 - 收尾验证计划

## Summary

青禾映画「对话创作 Agent」模块的实现已在前一会话基本完成：一个独立的 ReAct 自主决策 Agent，支持联网搜索（DuckDuckGo）+ 主流水线调用（真实）+ 媒体生成（mock 占位）。所有 10 个模块文件、3 个测试文件、配置项、依赖、路由注册均已就位。

本计划聚焦于**收尾验证**：修复服务层测试中遗漏的 `web_search` mock（避免真实网络调用），然后跑通全部测试、行数核对与导入验证，确保模块可交付。

## Current State Analysis

### 已完成（无需改动）

模块文件（`qinghe-video/src/conversation_agent/`，全部 ≤300 行）：

| 文件 | 行数 | 职责 |
|------|------|------|
| `__init__.py` | 42 | 模块对外接口（刻意不导入 router，遵循 canvas 模式） |
| `models.py` | 66 | Pydantic v2 模型（`ConfigDict(extra="forbid")`） |
| `prompts.py` | 30 | 系统提示词常量（不走 get_system_prompt，避免大括号转义） |
| `search.py` | 79 | DuckDuckGo 搜索，`try/except ImportError` 优雅降级，`DDGS=None` 兜底 |
| `pipeline_tool.py` | 83 | 真实调用 `app_graph.invoke(state)`，返回 `final_report` 或错误 |
| `media_tools.py` | 51 | 生图/生视频/TTS 的 mock 占位（TODO 标注后续接入真实服务） |
| `tools.py` | 149 | 5 个工具的 OpenAI function calling schema + 统一执行入口 |
| `react_agent.py` | 98 | ReAct 循环生成器（`bind_tools` + 逐事件 yield） |
| `service.py` | 113 | 同步 `run_conversation()` + 流式 `run_conversation_stream()` |
| `router.py` | 71 | `/api/conversation/chat`（SSE）+ `/chat/sync` + `/health` |

配置与依赖：
- `src/config.py` L95-97：`CONVERSATION_AGENT_MAX_ITERATIONS=10`、`CONVERSATION_AGENT_TEMPERATURE=0.7`、`WEB_SEARCH_MAX_RESULTS=5`
- `pyproject.toml` L27：`"duckduckgo-search>=6.0"`
- `src/main.py` L30 + L84：路由已导入并挂载

测试文件：
- `tests/conversation_helpers.py`：`FakeChatModel`（耗尽时重复最后响应）、`FakeDDGS`（含 `__call__` 支持 `with DDGS() as ddgs:`）、`FakeGraph`、`register_and_login`
- `tests/test_conversation_agent.py`：工具层 + ReAct 循环测试（已用 `_run_react(monkeypatch=...)` mock web_search）
- `tests/test_conversation_agent_api.py`：服务层 + API 测试（**遗留问题所在**）

### 遗留问题

`test_conversation_agent_api.py` 中 3 个测试用 `web_search` 工具调用，但只 mock 了 `service_mod.get_llm`，未 mock `search_mod.web_search`：

1. **`test_run_conversation_sync`**（L29）：FakeAIMessage 触发 `web_search({"query": "大米"})` → 真实联网
2. **`test_run_conversation_stream_yields_in_order`**（L50）：同上，`web_search({"query": "x"})` → 真实联网
3. **`test_usage_example`**（L129）：`web_search({"query": "五常大米 价格 2026"})` → 真实联网

后果：
- 若 `duckduckgo-search` 已安装 → 测试变慢（~24s）且 flaky（依赖网络）
- 若未安装 → `web_search` 返回 `[]`，测试仍能过但测的不是预期路径
- 无论哪种情况，测试都不确定

## Proposed Changes

### 改动 1：`tests/test_conversation_agent_api.py` — 补 web_search mock

**What**：在文件顶部新增 `search_mod` 导入；在 3 个触发 `web_search` 的测试函数体内补 `monkeypatch.setattr(search_mod, "web_search", ...)`。

**Why**：让服务层测试与 ReAct 层测试保持一致，避免真实网络调用，确保测试确定性。

**How**：

1. 顶部 import 区追加（在 `from src.conversation_agent import service as service_mod` 之后）：
   ```python
   from src.conversation_agent import search as search_mod
   ```

2. 在 `test_run_conversation_sync` 内 `monkeypatch.setattr(service_mod, "get_llm", ...)` 之后追加：
   ```python
   monkeypatch.setattr(
       search_mod, "web_search",
       lambda q, max_results=None: [{"title": "T", "url": "U", "snippet": "S"}],
   )
   ```

3. 同样追加到 `test_run_conversation_stream_yields_in_order` 和 `test_usage_example` 的 `monkeypatch.setattr(service_mod, "get_llm", ...)` 之后。

**不改动的测试**（无需 mock web_search）：
- `test_chat_sync_endpoint_requires_auth` / `test_health_endpoint_requires_auth`：401 鉴权测试，不进 ReAct 循环
- `test_chat_sync_endpoint_with_auth` / `test_chat_stream_endpoint_sse`：FakeAIMessage 无 tool_calls，不触发任何工具

### 改动 2：验证（无文件改动，仅执行命令）

1. **导入验证**：`python -c "from src.conversation_agent import run_conversation, ConversationRequest; print('OK')"`
2. **针对性测试**：`python -m pytest tests/test_conversation_agent.py tests/test_conversation_agent_api.py -v`（期望 20 passed，无网络延迟）
3. **全量回归**：`python -m pytest tests/ -v`（期望全绿，确认未破坏既有测试）
4. **行数核对**：所有 `src/conversation_agent/*.py` 均 ≤300 行（已人工核对，最大为 `tools.py` 149 行）

## Assumptions & Decisions

1. **不重新设计已实现的模块**：前一会话已按用户确认的方案（自实现 ReAct + DuckDuckGo + 媒体 mock）完成，当前只做收尾验证，不推翻重做。
2. **mock 策略与 ReAct 层测试保持一致**：复用 `lambda q, max_results=None: [{"title": "T", "url": "U", "snippet": "S"}]` 这一既定 mock 形式，与 `test_conversation_agent.py` 的 `_run_react()` helper 完全一致。
3. **不修改 `test_conversation_agent.py`**：该文件的 ReAct 循环测试已正确 mock web_search（通过 `_run_react(monkeypatch=...)`），无需改动。
4. **不修改模块源码**：模块实现正确，问题仅在测试侧。
5. **依赖安装状态未知**：无论 `duckduckgo-search` 是否已安装，补 mock 后测试行为都一致，无需单独处理安装。

## Verification Steps

执行顺序（每步依赖上一步通过）：

1. `cd qinghe-video && python -c "from src.conversation_agent import run_conversation, ConversationRequest, run_conversation_stream; print('import OK')"`
2. `cd qinghe-video && python -m pytest tests/test_conversation_agent.py tests/test_conversation_agent_api.py -v`
   - 期望：20 passed，每个测试 <1s（无网络调用）
3. `cd qinghe-video && python -m pytest tests/ -v`
   - 期望：全量通过，不破坏既有 auth/graph/canvas 等测试
4. 行数核对（人工，已确认）：`for f in src/conversation_agent/*.py; do wc -l "$f"; done` — 最大 149 行 < 300
