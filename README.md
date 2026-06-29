# 青禾映画 🌾

> 面向农户和农业合作社的多 Agent 协同短视频智能创作平台

用户只需输入农产品基本信息，系统通过 **5 个 AI Agent 流水线协作**，自动生成一套完整的短视频创作方案（策划 → 文案 → 分镜脚本 → AI 视觉 Prompt → 投放策略），并支持 **AI 出图、语音配音、视频合成** 一站式出片。

---

## 核心特性

- **多 Agent 流水线** — LangGraph StateGraph 编排，5 个专业 Agent 顺序协作；任一节点出错自动跳过后续并生成错误报告
- **分步工坊** — 8 步卡片网格 UI，支持勾选自动执行到任意步骤，或手动逐步运行、重试
- **对话创作** — Chat 式交互，一句话创意即可触发全流程
- **AI 出图** — 集成 Doubao Seedream 生图模型，逐镜生成分镜图片素材
- **语音配音** — 基于 Edge-TTS 合成自然语音旁白
- **视频合成** — 图片轮播 + 配音 → 竖屏短视频（MoviePy）
- **图像工作室** — 多张图片变体生成与 9 宫格排列预览
- **结构化输出** — 所有 Agent 输出经 Pydantic v2 严格校验，确保格式一致
- **模型可切换** — 通过 `.env` 一键切换 OpenAI / DeepSeek / Qwen 等 OpenAI 兼容接口
- **JWT 鉴权** — 内置用户注册/登录系统，SQLite + Alembic 管理数据库

---

## 文档入口

- 📋 [产品需求文档 (PRD)](./docs/prd.md)
- 🔌 [API 接口文档](./docs/api/endpoints.md)
- 🎨 [提示词与设计文档](./docs/design/prompts.md)
- 🤖 [AI Agent 开发规范](./AGENTS.md)

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 编排框架 | LangGraph >= 0.2 |
| LLM 接口 | langchain_openai.ChatOpenAI（OpenAI 兼容） |
| 后端框架 | FastAPI + Uvicorn |
| 前端框架 | React 18 + TypeScript + Vite |
| UI 组件 | shadcn/ui + Radix UI + Tailwind CSS |
| 状态管理 | Zustand（sessionStorage 持久化） |
| 路由 | React Router 6（Hash Router） |
| 动画 | Framer Motion |
| 数据校验 | Pydantic v2 |
| 鉴权 | JWT（python-jose） + bcrypt + SQLite |
| 数据库迁移 | Alembic + SQLAlchemy |
| 图片生成 | Doubao Seedream（OpenAI 兼容中转） |
| 语音合成 | Edge-TTS |
| 视频合成 | MoviePy |
| 语言 | Python 3.11+ / TypeScript 5+ |

---

## 仓库结构

```
Qhyh_Agent/
├── README.md                   # 本文件
├── AGENTS.md                   # AI Agent 开发规范
├── run.ps1                     # PowerShell 一键启动（后端 + 前端）
├── docs/                        # 项目文档目录
│   ├── prd.md                  # 产品需求文档
│   ├── api/endpoints.md        # API 接口文档
│   ├── design/prompts.md       # 提示词与设计文档
│   └── images/                 # 图片资料
│
└── qinghe-video/               # 主项目目录
    ├── README.md               # 项目详细文档
    ├── pyproject.toml           # Python 依赖配置
    ├── .env.example             # 环境变量模板
    ├── alembic.ini / alembic/   # 数据库迁移
    ├── start.sh / start.bat     # 一键启动脚本
    ├── src/                     # 后端 FastAPI + LangGraph
    │   ├── main.py              # FastAPI 入口
    │   ├── graph.py             # LangGraph 图定义
    │   ├── state.py             # 全局状态 TypedDict
    │   ├── models.py            # Pydantic 输出模型
    │   ├── config.py            # pydantic-settings 配置
    │   ├── agent_steps.py       # Agent 步骤注册表
    │   ├── text_polish.py       # AI 润写
    │   ├── image_generation.py  # AI 生图
    │   ├── tts_service.py       # 语音合成
    │   ├── video_compose.py     # 视频合成
    │   ├── nodes/               # Agent 节点函数
    │   ├── prompts/             # 系统 Prompt .txt
    │   ├── auth/                # JWT 鉴权
    │   ├── db/                  # SQLAlchemy ORM
    │   └── image_studio/        # 图像工作室
    ├── frontend/                # React 前端
    │   ├── src/
    │   │   ├── pages/           # 页面组件
    │   │   ├── components/      # UI 组件
    │   │   ├── hooks/           # API Hooks
    │   │   ├── stores/          # Zustand 状态管理
    │   │   └── lib/             # 工具函数 / 常量
    │   ├── tailwind.config.ts
    │   ├── vite.config.ts
    │   └── package.json
    ├── outputs/                 # 生成产物（图片/音频/视频）
    └── tests/                   # 单元测试
```

---

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+ / npm 9+

### 安装

```bash
cd qinghe-video

# 后端
pip install -e .
pip install -e ".[dev]"     # 含 pytest

# 前端
cd frontend
npm install
```

### 配置

```bash
cd qinghe-video
cp .env.example .env
```

编辑 `.env`，**必须填写 `LLM_API_KEY`**：

```dotenv
LLM_API_KEY=sk-你的真实key
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1
```

切换 LLM 提供商：

```dotenv
# DeepSeek
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com/v1

# 通义千问
LLM_MODEL=qwen-plus
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

### 启动

**方式一：分终端启动（推荐开发）**

```bash
# 终端 1 — 后端（端口 18739）
cd qinghe-video
uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload

# 终端 2 — 前端（端口 5173）
cd qinghe-video/frontend
npm run dev
```

**方式二：PowerShell 一键启动（Windows，从仓库根目录）**

```powershell
.\run.ps1
```

**方式三：Shell/Bat 脚本**

```bash
cd qinghe-video
bash start.sh       # Linux / macOS / Git Bash
start.bat           # Windows
```

### 访问

| 服务 | 地址 |
|------|------|
| React 前端 | http://localhost:5173 |
| 后端 API 文档 | http://localhost:18739/docs |
| 健康检查 | http://localhost:18739/api/health |

---

## 页面说明

| 页面 | 路由 | 说明 |
|------|------|------|
| 开始创作 | `#/create` | 一键触发 SSE 流水线，实时展示 Agent 执行进度 |
| 对话创作 | `#/chat` | Chat 式交互，一句话创意触发全流程 |
| 分步工坊 | `#/workshop` | 8 步卡片网格，支持自动/手动执行与重试 |
| 图像工作室 | `#/image-studio` | 图片变体生成 + 9 宫格排列 |
| Agent 管理 | `#/agents` | 查看各 Agent 配置与 Prompt |
| 方案详情 | `#/plan` | 查看已生成方案 |

---

## 流水线架构

```
用户输入（产品名 / 产地 / 卖点 / 平台 / 时长）
  │
  ▼
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  策划 Agent  │ →  │  文案 Agent  │ →  │  脚本 Agent   │ →  │  视觉 Agent   │ →  │  投放 Agent   │
│  planner     │    │  copywriter  │    │  scriptwriter │    │ visual_design │    │  distributor  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       └──── 错误时 ─────────────────────────────────────────────────────→ 报告生成
       ▼                  ▼                  ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                   report_generator                                    │
│                           整合所有输出 → Markdown 报告                                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 测试

```bash
cd qinghe-video
pip install -e ".[dev]"
pytest tests/ -v
```

测试为纯单元测试 — 校验模型构造、状态字段、图构建、Prompt 加载。**不需要 LLM API Key**。

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/generate` | 运行完整多 Agent 流水线（同步） |
| POST | `/api/generate/stream` | SSE 流式返回 Agent 执行进度 |
| POST | `/api/agents/{step}` | 执行单个 Agent 步骤 |
| POST | `/api/text/polish` | AI 润写（一句话 → 完整表单） |
| POST | `/api/images/generate` | AI 生图 |
| POST | `/api/tts/generate` | 语音合成 |
| POST | `/api/video/compose` | 视频合成 |
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录（JWT） |
| GET | `/api/health` | 健康检查 |

详见 [Swagger 文档](http://localhost:18739/docs)。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_MODEL` | `gpt-4o-mini` | LLM 模型名称 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容 API 地址 |
| `LLM_API_KEY` | *(必填)* | API Key |
| `LLM_TEMPERATURE` | `0.7` | 采样温度 |
| `LLM_MAX_TOKENS` | `2048` | 最大输出 token 数 |
| `APP_PORT` | `18739` | 后端端口 |
| `SQLITE_PATH` | `qinghe.db` | SQLite 数据库文件 |
| `JWT_SECRET` | *(开发默认)* | JWT 签名密钥 |
| `JWT_EXPIRE_MINUTES` | `1440` | JWT 有效期（分钟） |
| `IMAGE_MODEL` | `doubao-seedream-5-0-260128` | 生图模型 |
| `IMAGE_SIZE` | `1920x1920` | 生成图片尺寸 |

---

## 迭代计划

- [x] 多 Agent 流水线（策划 → 文案 → 脚本 → 视觉 → 投放）
- [x] 分步工坊（卡片网格化，手动/自动执行）
- [x] SSE 流式进度推送
- [x] AI 出图（Doubao Seedream）
- [x] 语音配音（Edge-TTS）
- [x] 视频合成（MoviePy）
- [x] 用户鉴权（JWT + SQLite）
- [x] 图像工作室
- [ ] LangGraph checkpoint 断点续跑
- [ ] 人工审批节点（HITL）
- [ ] 接入 AI 视频生成
- [ ] 审核 Agent（合规校验）
- [ ] 历史方案存储与检索
- [ ] OSS 持久化生成素材

---

## 许可证

私有项目，暂未开源。

---

_青禾映画 — LangGraph 多 Agent 流水线驱动 · 让农业短视频创作像农事一样有条不紊_
