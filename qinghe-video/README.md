# 青禾映画 🌾

> 农业短视频智能创作平台 MVP

用户只需输入农产品基本信息（名称、产地、卖点、目标平台等），系统通过 **5 个 AI Agent 流水线协作**，自动生成一套完整的短视频创作方案（策划 → 文案 → 分镜脚本 → AI 视觉 prompt → 投放策略）。

---

## ✨ 核心特性

- **流水线编排**：基于 LangGraph StateGraph，5 个 Agent 顺序协作，任一节点出错自动跳过后续并生成错误报告
- **结构化输出**：所有 Agent 输出经 Pydantic v2 严格校验，`with_structured_output` 确保格式一致
- **模型可切换**：通过 `.env` 一键切换 OpenAI / DeepSeek / Qwen 等兼容接口
- **双入口**：FastAPI 后端 + Streamlit 前端，开箱即用
- **MVP 优先**：同步调用、无外部依赖、无 checkpoint，最快跑通主链路

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 编排框架 | LangGraph >= 0.2 |
| LLM 接口 | langchain_openai.ChatOpenAI（OpenAI 兼容） |
| 后端 | FastAPI + uvicorn |
| 前端 | Streamlit |
| 数据校验 | Pydantic v2 |
| 配置管理 | pydantic-settings + `.env` |
| 语言 | Python 3.11+ |

## 📁 项目结构

```
qinghe-video/
├── pyproject.toml              # 项目依赖
├── .env / .env.example         # 环境变量配置（核心）
├── start.sh / start.bat        # 一键启动脚本
├── README.md
├── src/
│   ├── main.py                 # FastAPI 入口
│   ├── graph.py                # LangGraph 图定义（核心）
│   ├── state.py                # 全局状态 TypedDict
│   ├── models.py               # Pydantic 数据模型
│   ├── config.py               # 配置加载
│   ├── nodes/
│   │   ├── llm.py              # LLM 实例工厂
│   │   ├── planner.py          # 策划 Agent
│   │   ├── copywriter.py       # 文案 Agent
│   │   ├── scriptwriter.py     # 脚本 Agent
│   │   ├── visual_designer.py  # 视觉 Agent
│   │   ├── distributor.py      # 投放 Agent
│   │   └── report_generator.py # 报告生成节点
│   └── prompts/
│       ├── planner.txt
│       ├── copywriter.txt
│       ├── scriptwriter.txt
│       ├── visual_designer.txt
│       └── distributor.txt
├── frontend/
│   └── app.py                  # Streamlit 前端
└── tests/
    └── test_graph.py
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd qinghe-video
pip install -e .
```

### 2. 配置环境变量

编辑 `.env` 文件，填入你的 LLM API Key：

```dotenv
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-你的真实key
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048

APP_HOST=0.0.0.0
APP_PORT=18739
LOG_LEVEL=INFO

STREAMLIT_PORT=18510
BACKEND_URL=http://localhost:18739
```

> 切换 DeepSeek：`LLM_MODEL=deepseek-chat`，`LLM_BASE_URL=https://api.deepseek.com/v1`
>
> 切换 Qwen：`LLM_MODEL=qwen-plus`，`LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`

### 3. 启动服务

**方式一：一键启动（同时跑后端 + 前端）**

```bash
# Linux / macOS / Git Bash
bash start.sh
# Windows
start.bat
```

**方式二：分两个终端启动**

```bash
# 终端 1：后端
uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload

# 终端 2：前端
streamlit run frontend/app.py --server.port 18510
```

### 4. 访问

- 前端：http://localhost:18510
- 后端 API 文档：http://localhost:18739/docs
- 健康检查：http://localhost:18739/api/health

## 📡 API 接口

### `POST /api/generate`

运行完整多 Agent 流水线。

**请求体**

```json
{
  "product_name": "阳山水蜜桃",
  "origin": "江苏无锡",
  "category": "水果",
  "selling_points": "汁多味甜、地理标志产品",
  "target_platform": "抖音",
  "target_duration": "30-60秒",
  "additional_info": ""
}
```

**响应体**

```json
{
  "task_id": "a1b2c3d4e5f6",
  "status": "success",
  "result": {
    "planner_output": { ... },
    "copywriter_output": { ... },
    "scriptwriter_output": { ... },
    "visual_output": { ... },
    "distributor_output": { ... },
    "final_report": "# 青禾映画 · 短视频创作方案\n...",
    "error": null
  }
}
```

### `GET /api/health`

返回 `{"status": "ok"}`。

## 🔧 流水线说明

```
用户输入
  ↓
[策划 Agent]   主题 / 卖点 / 受众 / 情绪基调
  ↓
[文案 Agent]   Hook / 正文 / CTA / 完整口播稿
  ↓
[脚本 Agent]   分镜 / 运镜 / BGM / 时长
  ↓
[视觉 Agent]   英文 AI 生图 prompt / 风格统一
  ↓
[投放 Agent]   平台规格 / 标题标签 / 发布时间 / 推广
  ↓
[报告生成]     Markdown 整合报告
```

任一节点写入 `error` 字段时，后续业务节点自动跳过，直接进入报告生成节点输出错误信息。

## 🧪 测试

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## 📌 后续迭代计划

- [ ] 引入 LangGraph checkpoint 支持断点续跑
- [ ] 增加人工审批节点（HITL）
- [ ] 接入真实 AI 生图 / 生视频接口
- [ ] 增加审核 Agent（合规校验）
- [ ] 历史方案存储与检索
- [ ] 多分支并行（同一产品生成多套方案）

---

_由 LangGraph 多 Agent 流水线自动生成 · MVP 版本_
