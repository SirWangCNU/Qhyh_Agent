# AGENTS.md

## Project overview

LangGraph multi-agent pipeline for agricultural short-video creation. 5 AI agents run sequentially: planner → copywriter → scriptwriter → visual_designer → distributor → report_generator. Any node writing `error` to state skips remaining nodes and jumps to report generation.

## Structure

All source code lives in `qinghe-video/`. The repo root has only `run.ps1` (PowerShell launcher) and `langgraph-qinghe-prompts.md` (design doc, not code).

```
qinghe-video/
├── src/                    # FastAPI backend + LangGraph pipeline
│   ├── main.py             # FastAPI entrypoint
│   ├── graph.py            # LangGraph StateGraph definition
│   ├── state.py            # QingheState TypedDict (shared state)
│   ├── models.py           # Pydantic v2 output models for all agents
│   ├── config.py           # pydantic-settings from .env
│   ├── nodes/              # Agent node functions
│   │   ├── llm.py          # ChatOpenAI factory (get_llm)
│   │   ├── planner.py, copywriter.py, scriptwriter.py, visual_designer.py, distributor.py
│   │   └── report_generator.py  # Pure Python (no LLM call)
│   └── prompts/            # System prompt .txt files (one per agent)
├── frontend/
│   ├── app.py              # Streamlit frontend
│   ├── index.html          # Static HTML frontend (served by FastAPI at /)
│   └── assets/             # CSS/JS for static frontend
├── tests/test_graph.py     # Unit tests (no LLM calls)
└── pyproject.toml
```

## Commands

All commands run from `qinghe-video/` directory:

```bash
cd qinghe-video

# Install
pip install -e .
pip install -e ".[dev]"     # includes pytest

# Run backend (port 18739, default)
uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload

# Run Streamlit frontend (port 18510, optional — static HTML also works)
streamlit run frontend/app.py --server.port 18510

# Tests (no LLM key needed — tests only validate models, state, graph build, prompt loading)
pytest tests/ -v

# PowerShell one-click (Windows, from repo root)
.\run.ps1                   # starts FastAPI only, serves static frontend at /
.\qinghe-video\start.ps1    # same behavior
```

## Environment

Copy `.env.example` to `.env` in `qinghe-video/`. **`LLM_API_KEY` is required** — the app will start without it but every pipeline call will fail.

Key vars: `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`, `APP_PORT` (default 18739).

Switch providers by changing `LLM_MODEL` + `LLM_BASE_URL` (DeepSeek, Qwen, etc. all use OpenAI-compatible API).

## Architecture quirks

- **Prompt escaping**: `config.get_system_prompt()` escapes `{` → `{{` and `}` → `}}` because LangChain's `ChatPromptTemplate` interprets braces as f-string variables. System prompts contain JSON examples with braces. If you add a new prompt file with intentional template variables, this function will break them — use `get_prompt()` directly instead.
- **Module-level graph singleton**: `src/graph.py` compiles the graph at import time (`app_graph = build_graph()`). The `get_system_prompt()` calls in each node module also run at import time. Changes to `.txt` prompt files require a server restart.
- **Two frontends**: FastAPI serves `frontend/index.html` as a static SPA at `/`. Streamlit (`frontend/app.py`) is a separate app that calls the same backend API. Both work independently.
- **SSE streaming**: `POST /api/generate/stream` returns Server-Sent Events. The static HTML frontend uses this endpoint. The Streamlit frontend also uses it.
- **No persistence**: MVP has no checkpoint, database, or task queue. All calls are synchronous and in-memory.
- **`json_repair` dependency**: Listed in pyproject.toml but not currently imported in source — may be used by LLM output parsing in langchain internals or reserved for future use.

## Coding standards

- **Modularity**: every file must be under 500 lines. If a file exceeds that, split it into separate modules. Each module should expose a clean interface callable by other scripts.
- **Think step by step**: before writing code, briefly outline the approach in comments or prose, then implement.
- **Output convention**: when adding a new module, include a usage example or simple test case alongside the implementation.

## Known bug: pipeline state lost on page navigation (static HTML frontend)

**Symptom**: When a user clicks nav links (#create / #pipeline / #result) or navigates to `/docs` and back during an active generation, the pipeline progress UI resets — active/done/error node badges vanish.

**Root cause**: `app.js:startGenerate()` stores all runtime state in local closure variables (`completedNodes`, `currentNode`, `errorNode`, `taskId`, `finalResult`). These are garbage-collected when the function scope is exited or the page reloads. There is no persistence layer.

**Fix direction** (not yet implemented):

1. Extract a new `state.js` module that manages pipeline state via `sessionStorage`:
   ```
   frontend/assets/js/state.js   # NEW — reads/writes sessionStorage under key "qinghe_pipeline_state"
   ```
2. In `app.js`, replace the local variables with calls to `Q.state.get()` / `Q.state.set()`.
3. On page load (`app.js` init), call `Q.state.restore()` to replay saved node states back into the DOM via `pipeline.setNodeState()`.
4. On SSE `node_update` / `error` / `complete` events, persist the new state immediately.
5. Add `state.js` as a `<script>` in `index.html` before `app.js`.

**State schema** to persist:
```json
{
  "taskId": "a1b2c3d4e5f6",
  "completedNodes": { "planner": true, "copywriter": true },
  "activeNode": "scriptwriter",
  "errorNode": null,
  "errorMsg": null,
  "finalResult": null
}
```

## Pydantic models

All agent output models use `ConfigDict(extra="forbid")` — adding extra fields to any output will raise `ValidationError`. The test `test_planner_output_model_forbids_extra` verifies this.

Field names in `models.py` **must match** the JSON keys in the corresponding `prompts/*.txt` system prompt files exactly, because `with_structured_output()` maps LLM JSON output to the Pydantic model by field name.

## Testing

Tests in `tests/test_graph.py` are pure unit tests — they validate model construction, state fields, graph compilation, and prompt file loading. No LLM API key is needed. No integration tests exist yet.
