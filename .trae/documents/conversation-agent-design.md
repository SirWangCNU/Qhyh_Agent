# 对话创作 Agent 模块实现计划

## 思路分析（先于代码）

### 目标定位
在 `src/conversation_agent/` 建立独立模块，实现一个能**自主思考、自主决策、可联网搜索**的对话创作 agent。用户通过对话描述农业短视频创作需求，agent 自主决定是否需要联网调研（农产品行情、热门话题）、是否调用主流水线生成完整方案、是否生成多媒体素材，最终给出创作产出。

### 核心机制 — 自实现 ReAct 循环
不引入 `langgraph-prebuilt` / `langchain-agents` 新依赖，基于现有 `langchain_openai.ChatOpenAI` 的 `bind_tools()`（OpenAI 兼容接口普遍支持 function calling）自行实现经典 ReAct 循环：

```
循环开始
  → LLM(messages) 输出 AIMessage
  → 若 AIMessage.tool_calls 为空 → 循环结束，content 即最终回答
  → 否则对每个 tool_call：执行对应工具函数 → 得到结果 → 包装为 ToolMessage 加入 messages
  → 回到循环开始
最大迭代数保护（默认 10）防止死循环
```

### 工具集设计（5 个）
| 工具名 | 实现方式 | 功能 |
|--------|----------|------|
| `web_search` | DuckDuckGo 真实（duckduckgo-search 包，免 key） | 搜索农产品行情、热门话题、竞品资料等外部信息 |
| `run_pipeline` | 真实调用 `src.graph.app_graph.invoke(state)` | 输入 UserInput 字段，跑现有 5 节点流水线产出完整方案 |
| `generate_image` | mock（返回占位 URL） | 生图，先跑通流程 |
| `generate_video` | mock（返回占位 URL） | 生视频，先跑通流程 |
| `generate_tts` | mock（返回占位 URL） | 语音合成，先跑通流程 |

### 模块化拆分（每文件 ≤300 行）
独立模块 `src/conversation_agent/`，内部按职责拆分 9 个文件，确保单一职责、可独立调用。

---

## Summary（摘要）
新增独立模块 `src/conversation_agent/`，实现自驱动 ReAct 对话创作 agent。agent 拥有 5 个工具：联网搜索（DuckDuckGo 真实）、主流水线调用（真实）、生图/生视频/TTS（mock）。对外提供同步服务函数 `run_conversation()`、流式生成器 `run_conversation_stream()`、以及 SSE HTTP 端点 `POST /api/conversation/chat`。配套纯单元测试（monkeypatch mock，无需 API key）。

## Current State Analysis（现状分析）

### 已有基础（基于 Phase 1 探索）
1. **LLM 工厂**：[llm.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/nodes/llm.py) 的 `get_llm(temperature, **kwargs) -> ChatOpenAI`，返回的 `ChatOpenAI`（langchain-openai 0.2+）支持 `bind_tools()`，是 ReAct 循环的基础。
2. **主流水线入口**：[graph.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/graph.py) 的模块级单例 `app_graph`，外部可直接 `app_graph.invoke(state_dict)` 调用，返回含 `planner_output`/`copywriter_output`/.../`final_report` 的最终 state。
3. **State 结构**：[state.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/state.py) 的 `QingheState(TypedDict, total=False)`，所有字段可选，输入字段为 `product_name`/`origin`/`category`/`selling_points`/`target_platform`/`target_duration`/`additional_info`。
4. **独立模块范例**：`src/canvas/`、`src/consistency_images/` 提供了 router/service/models 分层、`app.include_router()` 挂载、`__init__.py` 刻意不导出 router（避免 alembic 加载 ORM 触发 FastAPI 链）的标准模式。
5. **配置模式**：[config.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py) 用 pydantic-settings，`case_sensitive=True`，模块级 `settings` 单例，`extra="ignore"`。
6. **测试模式**：`tests/conftest.py` 内存 SQLite + autouse fixture；业务 mock 用 `monkeypatch` 替换 `get_llm`/`invoke_structured_llm`/httpx；纯单元测试无需 API key。
7. **SSE 模式**：`POST /api/generate/stream` 已有 SSE 先例（`start`/`node_start`/`node_update`/`error`/`complete` 事件），前端 `lib/sse.ts` + `use-generate-stream.ts` 消费。

### 现状缺口
- **无任何 ReAct/tool calling/agent executor 实现**：现有 5 节点是固定状态机，无自主决策循环。
- **无联网搜索能力**：无 duckduckgo/tavily 等依赖，所有 LLM 输入仅来自用户 UserInput。
- **LLM 调用统一走 `invoke_structured_llm`**（JSON 模式 + json_repair 解析），**不走 tool calling**；ReAct agent 需新链路。
- **前端 `use-chat-pipeline` 是纯前端编排**（顺序调单步 Agent API），后端无 chat/conversation 端点。

---

## Proposed Changes（拟议变更）

### 1. 新增依赖
**文件**：[pyproject.toml](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/pyproject.toml)
- 在 `dependencies` 数组新增：`"duckduckgo-search>=6.0"`（DuckDuckGo 搜索 SDK，免 API key）
- 不引入 langgraph-prebuilt / langchain-agents（自实现 ReAct，复用现有 langchain-openai 的 `bind_tools`）

### 2. 配置项（可选，零配置可跑）
**文件**：[config.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py)
- 在 `Settings` 类新增 3 个字段（均有默认值）：
  - `CONVERSATION_AGENT_MAX_ITERATIONS: int = 10`（ReAct 最大迭代数）
  - `CONVERSATION_AGENT_TEMPERATURE: float = 0.7`（agent 思考温度）
  - `WEB_SEARCH_MAX_RESULTS: int = 5`（DuckDuckGo 单次返回结果数）
- 在 `.env.example` 追加这 3 项说明（注释标注可选）。

### 3. 新增独立模块 `src/conversation_agent/`

#### 3.1 `__init__.py`（~25 行）
- 模块文档字符串。
- **刻意不导入 router**（遵循 `canvas/` 模式，避免 alembic env.py 加载 ORM 时触发 FastAPI 依赖链）。
- 仅导出纯服务函数：`run_conversation`、`run_conversation_stream`、`ConversationRequest`、`ConversationResponse`。
- `__all__` 显式声明。

#### 3.2 `models.py`（~90 行）
Pydantic v2 模型，`ConfigDict(extra="forbid")`：
- `ConversationMessage`：`role: Literal["user","assistant","tool"]`、`content: str`、`tool_calls: list[dict] | None`、`tool_call_id: str | None`。
- `ConversationRequest`：`messages: list[ConversationMessage]`、`max_iterations: int | None`（覆盖默认）。
- `ConversationEvent`：SSE 事件统一模型，`event: Literal["think","tool_call","tool_result","answer","error","done"]`、`data: dict`。
- `ConversationResponse`：`answer: str`、`events: list[ConversationEvent]`、`iterations: int`。
- `ToolResult`：内部工具执行结果，`name: str`、`output: str`、`success: bool`。

#### 3.3 `prompts.py`（~80 行）
- `CONVERSATION_AGENT_SYSTEM_PROMPT` 常量（多行字符串）：定义 agent 角色（青禾映画农业短视频对话创作助手）、可用工具使用指引、ReAct 思考格式要求、输出约束（中文回答）。
- 明确告知 agent：可调用 `web_search` 调研外部信息、`run_pipeline` 生成完整方案、`generate_image/video/tts` 生成素材；需先思考是否需要搜索，再决定调用哪个工具。
- 不走 `get_system_prompt()`（避免大括号转义），直接用常量字符串（prompt 内无 JSON 示例，无大括号冲突）。

#### 3.4 `search.py`（~80 行）— DuckDuckGo 真实搜索
- `def web_search(query: str, max_results: int | None = None) -> list[dict]`：调用 `duckduckgo_search.DDGS`，返回 `[{"title","url","snippet"}]`。
- `max_results` 默认取 `settings.WEB_SEARCH_MAX_RESULTS`。
- 异常捕获：网络错误返回空列表 + 日志告警（不抛错，保证 agent 循环不中断）。
- `def web_search_tool_func(query: str) -> str`：包装为工具函数，返回格式化字符串（标题+摘要+URL 拼接），供 ReAct 循环调用。

#### 3.5 `pipeline_tool.py`（~90 行）— 主流水线真实调用
- `def run_pipeline(product_name, origin, category, selling_points, target_platform, target_duration, additional_info) -> dict`：组装 `QingheState` dict → 调用 `from src.graph import app_graph` → `app_graph.invoke(state)` → 返回最终 state。
- 处理 `state.get("error")`：若流水线报错，返回错误信息字符串而非完整 state。
- `def run_pipeline_tool_func(**kwargs) -> str`：包装为工具函数，返回 `final_report`（Markdown）或错误信息。

#### 3.6 `media_tools.py`（~80 行）— mock 媒体生成
- `def generate_image_tool_func(prompt: str, size: str = "1920x1920") -> str`：mock，返回 `"[mock] 已生成图片: prompt=..., size=..., url=/outputs/image/mock_xxx.jpg"`。
- `def generate_video_tool_func(prompt: str, duration: int = 5) -> str`：mock，返回占位字符串。
- `def generate_tts_tool_func(text: str, voice: str = "zh-CN-XiaoxiaoNeural") -> str`：mock，返回占位字符串。
- 每个 mock 函数顶部注释标注 `# TODO: 接入真实 image_generation/video_generation/tts_service`，预留后续替换点。
- 内部用 `uuid` 生成唯一 id，`logging.info` 记录调用，便于调试。

#### 3.7 `tools.py`（~110 行）— 工具注册表 + schema
- `def get_tool_schemas() -> list[dict]`：返回 OpenAI function calling 格式的工具 schema 列表（5 个工具的 name/description/parameters JSON Schema）。
- `def get_tool_functions() -> dict[str, Callable]`：返回 `{工具名: 工具函数}` 映射，工具函数来自 `search.py`/`pipeline_tool.py`/`media_tools.py`。
- `def execute_tool(name: str, args: dict) -> ToolResult`：统一工具执行入口，查表调用 + 异常捕获 + 返回 `ToolResult`。
- schema 定义与工具函数严格对齐（参数名、类型一致），避免 LLM 传错参数。

#### 3.8 `react_agent.py`（~180 行）— ReAct 循环核心
核心文件，实现自主决策循环：
- `def run_react_loop(llm, messages, tools_schema, tool_functions, max_iterations) -> tuple[str, list[dict]]`：
  - 用 `llm.bind_tools(tools_schema)` 绑定工具。
  - 循环 `for i in range(max_iterations)`：
    - `ai_msg = llm.invoke(messages)` → 取 `ai_msg.content` 与 `ai_msg.tool_calls`。
    - `messages.append(ai_msg)`。
    - 若 `not ai_msg.tool_calls` → 返回 `(content, trace)`。
    - 否则对每个 `tool_call`：`execute_tool(name, args)` → 构造 `ToolMessage` → `messages.append(tool_msg)` → 记录 trace。
  - 达到最大迭代仍未结束 → 返回 `(当前 content + "已达最大迭代数"提示, trace)`。
- `trace` 记录每步（think/tool_call/tool_result）供前端展示与调试。
- 异常处理：单工具失败不中断循环（ToolMessage 写入错误信息让 LLM 自行处理）；LLM 调用失败抛出。
- 不依赖 FastAPI，纯函数可被任何脚本调用。

#### 3.9 `service.py`（~120 行）— 对外服务函数
- `def run_conversation(request: ConversationRequest) -> ConversationResponse`：同步执行，内部调 `run_react_loop`，收集所有事件，返回完整响应。
- `def run_conversation_stream(request: ConversationRequest) -> Generator[ConversationEvent, None, None]`：流式生成器，逐事件 yield（think/tool_call/tool_result/answer/done），供 SSE 端点使用。
- 两者共享 `_prepare_messages()`（把 `ConversationMessage` 转 LangChain `HumanMessage`/`AIMessage`/`ToolMessage`）和 `_build_llm()`（调 `get_llm(temperature=settings.CONVERSATION_AGENT_TEMPERATURE)`）。
- `max_iterations` 优先取 request 覆盖值，否则取 `settings.CONVERSATION_AGENT_MAX_ITERATIONS`。

#### 3.10 `router.py`（~110 行）— FastAPI 路由
- `router = APIRouter(prefix="/api/conversation", tags=["conversation"])`
- `POST /chat`：SSE 流式端点，`Depends(get_current_user)` 鉴权，消费 `run_conversation_stream()`，用 `EventSourceResponse`（或手写 `StreamingResponse` + `text/event-stream`）逐事件推送。
- `POST /chat/sync`：同步端点（非流式），调 `run_conversation()`，返回完整 `ConversationResponse`（便于测试与不支持 SSE 的客户端）。
- `GET /health`：健康检查，返回 `{"status":"ok","module":"conversation_agent"}`。

### 4. 挂载路由
**文件**：[main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py)
- 顶部新增 `from src.conversation_agent.router import router as conversation_router`。
- 在 `app.include_router(...)` 区域新增 `app.include_router(conversation_router)`。
- 不改动其他路由。

### 5. 测试
**文件**：`tests/test_conversation_agent.py`（~250 行，可拆分为 2 个文件若超 300）

遵循 `conftest.py` + monkeypatch 模式，纯单元测试无需 API key：

**5.1 工具层测试**（无 LLM）：
- `test_web_search_returns_results`：monkeypatch `DDGS` 返回固定结果，验证 `web_search` 格式化输出。
- `test_web_search_handles_error`：monkeypatch 抛异常，验证返回空列表不中断。
- `test_run_pipeline_success`：monkeypatch `app_graph.invoke` 返回含 `final_report` 的 state，验证 `run_pipeline_tool_func` 返回报告。
- `test_run_pipeline_error`：monkeypatch 返回含 `error` 的 state，验证返回错误信息。
- `test_mock_media_tools`：验证 3 个 mock 工具返回占位字符串、含 uuid。
- `test_execute_tool_dispatch`：验证 `execute_tool` 正确分发到对应函数、未知工具返回失败。
- `test_get_tool_schemas_format`：验证 5 个 schema 结构正确（name/description/parameters）。

**5.2 ReAct 循环测试**（mock LLM tool_calls 序列）：
- `test_react_loop_single_tool_then_answer`：mock LLM 第 1 次返回 tool_call、第 2 次返回纯文本答案，验证循环 2 次终止、trace 正确。
- `test_react_loop_multi_tools`：mock 第 1 次返回 2 个 tool_calls，验证 2 个工具都执行。
- `test_react_loop_max_iterations`：mock LLM 永远返回 tool_call，验证达到 max_iterations 终止、返回提示。
- `test_react_loop_tool_failure_continues`：mock 工具抛异常，验证 ToolMessage 写入错误、循环继续。

**5.3 服务层 + API 测试**：
- `test_run_conversation_sync`：mock LLM，验证 `ConversationResponse` 字段完整。
- `test_run_conversation_stream`：mock LLM，验证生成器逐事件 yield 顺序正确。
- `test_chat_endpoint_requires_auth`：`TestClient` 无 token 调 `POST /api/conversation/chat/sync` 返回 401。
- `test_chat_endpoint_with_auth`：注册登录拿 token，mock LLM + service，验证返回 200 + 字段。

**5.4 mock LLM 工具模式**（关键测试设施）：
自定义 `FakeChatModel` 类（在测试文件内）：
- 接受 `responses: list`（预设的 AIMessage 序列）。
- 实现 `.bind_tools(schemas)` 返回 self（忽略 schema）。
- 实现 `.invoke(messages)` 按序弹出下一个预设响应。
- 通过 monkeypatch 替换 `conversation_agent.service.get_llm` 为返回 `FakeChatModel` 的工厂。

---

## Assumptions & Decisions（假设与决策）

### 决策
1. **自实现 ReAct 循环**（用户确认）：不引入 langgraph-prebuilt，基于 `ChatOpenAI.bind_tools()` 自行实现，完全可控、模块清晰、与现有 300 行/文件约束契合。
2. **DuckDuckGo 搜索**（用户确认）：`duckduckgo-search` 包，免 API key，零配置可跑。
3. **工具范围**（用户确认）：联网搜索（真实）+ 主流水线（真实）+ 生图/生视频/TTS（mock）。
4. **生图/生视频/TTS 先 mock**（用户补充）：返回占位 URL，跑通主流程；mock 函数顶部留 TODO 注释，后续可替换为真实 `image_generation`/`video_generation`/`tts_service` 调用。
5. **独立模块**（用户要求）：`src/conversation_agent/` 独立文件夹，不与现有 `nodes/` 流水线耦合，仅通过 `app_graph.invoke` 调用主流水线。
6. **每文件 ≤300 行**（用户要求，比 AGENTS.md 的 500 行更严格）：9 个文件均控制在 300 行内。
7. **`__init__.py` 不导出 router**（遵循 canvas 模式）：避免 alembic env.py 加载 ORM 触发 FastAPI 依赖链，main.py 用 `from src.conversation_agent.router import router` 显式导入。
8. **system prompt 用常量字符串**（不走 `get_system_prompt`）：prompt 内无 JSON 示例、无大括号冲突，直接用 Python 常量更清晰。
9. **SSE + 同步双端点**：`/chat` 流式（体验好）+ `/chat/sync` 同步（易测试、兼容旧客户端）。
10. **错误不中断循环**：单工具失败写错误 ToolMessage 让 LLM 自行处理；LLM 调用失败才抛出。

### 假设
- 现有 `LLM_MODEL`/`LLM_BASE_URL` 配置的模型支持 OpenAI function calling（DeepSeek/Qwen/GPT 系列均支持；若不支持 `bind_tools`，agent 会降级为纯文本对话，需在测试中验证）。
- `duckduckgo-search` 包在 Windows 环境可正常安装运行（纯 Python 包，无系统依赖）。
- 现有 `app_graph.invoke` 可被外部直接调用（已确认 graph.py 模块级单例 `app_graph`）。
- conftest.py 的内存 SQLite + autouse fixture 对新测试自动生效（已确认是模块级 `app.dependency_overrides`）。

---

## Verification（验证步骤）

### 1. 单元测试（无需 API key）
```bash
cd qinghe-video
pytest tests/test_conversation_agent.py -v
```
预期：所有测试通过，覆盖工具层、ReAct 循环、服务层、API 鉴权。

### 2. 全量测试回归
```bash
cd qinghe-video
pytest tests/ -v
```
预期：原有测试 + 新增测试全部通过，无回归。

### 3. 模块导入验证
```bash
cd qinghe-video
python -c "from src.conversation_agent import run_conversation, ConversationRequest; print('OK')"
```
预期：输出 `OK`，确认模块可被其他脚本调用、无 import 循环、不触发 alembic 依赖链。

### 4. 启动后端验证路由挂载
```bash
cd qinghe-video
uvicorn src.main:app --port 18739
# 另开终端
curl http://localhost:18739/api/conversation/health
```
预期：返回 `{"status":"ok","module":"conversation_agent"}`。

### 5. 鉴权验证
```bash
curl -X POST http://localhost:18739/api/conversation/chat/sync -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"测试"}]}'
```
预期：返回 401（无 token）。

### 6. 端到端验证（需 LLM_API_KEY）
注册登录拿 token 后：
```bash
curl -X POST http://localhost:18739/api/conversation/chat/sync \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"帮我创作一个关于五常大米的农业短视频，先搜一下最近大米市场行情"}]}'
```
预期：agent 自主调用 `web_search` → 可能调用 `run_pipeline` → 返回中文创作方案，`events` 含 think/tool_call/tool_result/answer。

### 7. 文件行数检查
```bash
cd qinghe-video/src/conversation_agent
for f in *.py; do echo "$f: $(wc -l < $f) lines"; done
```
预期：所有文件 ≤300 行。

### 8. 附带用例测试（用户要求）
在 `tests/test_conversation_agent.py` 末尾提供 `test_usage_example` 作为简单用例示范，展示如何通过 `run_conversation()` 直接调用 agent（mock LLM），输出可在测试日志中查看。
