# 青禾映画 🌾

> 面向农户和农业合作社的多 Agent 协同短视频智能创作平台

用户只需输入农产品基本信息，系统通过 **5 个 AI Agent 流水线协作**，自动生成一套完整的短视频创作方案（策划 → 文案 → 分镜脚本 → AI 视觉 Prompt → 投放策略），并支持 **AI 出图、语音配音、视频合成** 一站式出片。

---

## 核心特性

- **多 Agent 流水线**：基于 LangGraph StateGraph，5 个专业 Agent 顺序协作；任一节点出错自动跳过后续并生成错误报告
- **分步工坊**：8 步卡片式 UI，支持勾选自动执行到任意步骤，或手动逐步运行、重试
- **对话创作**：Chat 式交互，一句话创意即可触发全流程
- **AI 出图**：集成 Doubao Seedream 生图模型，逐镜生成分镜图片素材
- **语音配音**：基于 Edge-TTS 合成自然语音旁白
- **视频合成**：图片轮播 + 配音 → 合成竖屏短视频（MoviePy）
- **图像工作室**：9 宫格图片变体生成
- **结构化输出**：所有 Agent 输出经 Pydantic v2 严格校验，确保格式一致
- **模型可切换**：通过 `.env` 一键切换 OpenAI / DeepSeek / Qwen 等 OpenAI 兼容接口
- **JWT 鉴权**：内置用户注册/登录系统，SQLite + Alembic 管理数据库
- **现代农业风 UI**：React + Vite + Tailwind CSS + shadcn/ui，纸张纹理质感设计

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
| 配置管理 | pydantic-settings + `.env` |
| 语言 | Python 3.11+ / TypeScript 5+ |

---

## 项目结构

```
qinghe-video/
├── pyproject.toml                  # Python 项目配置与依赖
├── .env.example                    # 环境变量模板
├── alembic.ini                     # 数据库迁移配置
├── alembic/                        # Alembic 迁移脚本
│   └── versions/
│       └── 001_create_users_table.py
├── start.sh / start.bat            # 一键启动脚本
├── src/                            # 后端 FastAPI + LangGraph
│   ├── main.py                     # FastAPI 入口
│   ├── graph.py                    # LangGraph 图定义（核心）
│   ├── state.py                    # 全局状态 TypedDict
│   ├── models.py                   # Pydantic 输出模型（所有 Agent）
│   ├── config.py                   # pydantic-settings 配置加载
│   ├── agent_steps.py              # Agent 步骤注册表
│   ├── text_polish.py              # AI 润写（一句话 → 完整表单）
│   ├── image_generation.py         # AI 生图（Doubao Seedream）
│   ├── tts_service.py              # 语音合成（Edge-TTS）
│   ├── video_compose.py            # 视频合成（MoviePy）
│   ├── video_generation.py         # 视频生成（预留）
│   ├── video_mvp.py                # 视频 MVP 预览
│   ├── nodes/                      # Agent 节点函数
│   │   ├── llm.py                  # ChatOpenAI 工厂（get_llm）
│   │   ├── planner.py              # 策划 Agent
│   │   ├── copywriter.py           # 文案 Agent
│   │   ├── scriptwriter.py         # 脚本 Agent
│   │   ├── visual_designer.py      # 视觉 Agent
│   │   ├── distributor.py          # 投放 Agent
│   │   └── report_generator.py     # 报告生成（纯 Python）
│   ├── prompts/                    # 系统 Prompt（每个 Agent 一个 .txt）
│   │   ├── planner.txt
│   │   ├── copywriter.txt
│   │   ├── scriptwriter.txt
│   │   ├── visual_designer.txt
│   │   ├── distributor.txt
│   │   └── polish.txt
│   ├── auth/                       # JWT 鉴权模块
│   │   ├── router.py               # 注册/登录 API
│   │   ├── security.py             # 密码哈希 / JWT 编解码
│   │   ├── dependencies.py         # FastAPI 依赖注入
│   │   └── schemas.py              # 请求/响应模型
│   ├── db/                         # 数据库
│   │   ├── database.py             # SQLAlchemy 引擎与会话
│   │   └── models.py               # ORM 模型（User）
│   ├── image_studio/               # 图像工作室模块
│   │   ├── router.py
│   │   ├── models.py
│   │   ├── prompt_builder.py
│   │   ├── image_variants.py
│   │   └── grid_composer.py
│   └── utils/
│       └── json_parser.py          # JSON 修复解析
├── frontend/                       # React 前端
│   ├── src/
│   │   ├── main.tsx                # React 入口
│   │   ├── App.tsx                 # 根组件
│   │   ├── index.css               # 全局样式 + CSS 变量
│   │   ├── routes/                 # 路由配置
│   │   ├── pages/                  # 页面组件
│   │   │   ├── CreatePage.tsx      # 开始创作（SSE 流水线）
│   │   │   ├── ChatPage.tsx        # 对话创作
│   │   │   ├── WorkshopPage.tsx    # 分步工坊
│   │   │   ├── ImageStudioPage.tsx # 图像工作室
│   │   │   ├── AgentsPage.tsx      # Agent 管理
│   │   │   └── PlanPage.tsx        # 方案详情
│   │   ├── components/             # UI 组件
│   │   │   ├── layout/             # 布局（AppLayout / Sidebar / Header）
│   │   │   ├── agent/              # Agent 输出渲染
│   │   │   ├── workshop/           # 工坊步骤卡片
│   │   │   ├── pipeline/           # 流水线可视化
│   │   │   ├── auth/               # 登录/注册
│   │   │   └── ui/                 # shadcn/ui 通用组件
│   │   ├── hooks/                  # React Query / API Hooks
│   │   ├── stores/                 # Zustand 状态管理
│   │   ├── lib/                    # 工具函数 / API 客户端 / 常量
│   │   └── types/                  # TypeScript 类型定义
│   ├── tailwind.config.ts          # Tailwind 配置
│   ├── vite.config.ts              # Vite 配置（API 代理）
│   └── package.json
├── outputs/                        # 生成产物（图片/音频/视频）
└── tests/
    ├── test_graph.py               # LangGraph 流水线单元测试
    └── test_auth.py                # 鉴权模块测试
```

---

## 快速开始

### 1. 环境要求

- Python 3.11+
- Node.js 18+
- npm 9+

### 2. 安装后端依赖

```bash
cd qinghe-video
pip install -e .
# 开发依赖（含 pytest）
pip install -e ".[dev]"
```

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

### 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，**必须填写 `LLM_API_KEY`**：

```dotenv
# 必填 —— LLM API Key
LLM_API_KEY=sk-你的真实key

# 默认 OpenAI，可切换为 DeepSeek / Qwen
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1

# 后端端口（默认 18739）
APP_PORT=18739

# JWT 密钥（生产环境务必修改）
JWT_SECRET=qinghe-dev-secret-change-me
```

<details>
<summary>切换 LLM 提供商示例</summary>

```dotenv
# DeepSeek
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxx

# 通义千问
LLM_MODEL=qwen-plus
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=sk-xxx
```

</details>

### 5. 启动服务

**方式一：分终端启动（推荐开发）**

```bash
# 终端 1 —— 后端（端口 18739）
cd qinghe-video
uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload

# 终端 2 —— 前端（端口 5173，Vite 开发服务器）
cd qinghe-video/frontend
npm run dev
```

**方式二：一键脚本（启动后端 + Streamlit 旧版前端）**

```bash
# Linux / macOS / Git Bash
bash start.sh

# Windows
start.bat
```

**方式三：PowerShell 一键（从仓库根目录）**

```powershell
.\run.ps1
```

### 6. 访问

| 服务 | 地址 |
|------|------|
| React 前端（Vite 开发） | http://localhost:5173 |
| 后端 API 文档（Swagger） | http://localhost:18739/docs |
| 后端健康检查 | http://localhost:18739/api/health |
| Streamlit 旧版前端（可选） | http://localhost:18510 |

---

## 页面说明

### 开始创作

输入农产品信息，一键触发 SSE 流式流水线，实时展示 5 个 Agent 的执行进度。

### 对话创作

Chat 式交互界面，输入一句话创意即可自动编排完整创作方案。

### 分步工坊

8 步卡片网格布局，每张卡片承载一个步骤的全部内容：

| 步骤 | 说明 | 类型 |
|------|------|------|
| 1. 策划 | 一句话创意 → AI 润写 → 完整策划方案 | LLM |
| 2. 文案 | Hook、口播稿、CTA | LLM |
| 3. 脚本 | 分镜表、运镜、BGM 建议 | LLM |
| 4. 视觉 | 视觉风格定义 + 逐镜 AI 生图 Prompt | LLM |
| 5. 投放 | 平台标题、标签、发布时间、推广策略 | LLM |
| 6. 出图 | 逐镜调用 AI 生图模型生成图片素材 | 图片生成 |
| 7. 配音 | 合成旁白语音（Edge-TTS） | TTS |
| 8. 合成 | 图片轮播 + 配音 → 竖屏视频（MoviePy） | 视频合成 |

支持：勾选自动执行到任意步骤、手动单步运行、失败重试。

### 图像工作室

输入描述生成多张图片变体，支持 9 宫格排列预览。

### Agent 管理

查看各 Agent 的配置信息与 Prompt 概要。

---

## API 接口

### `POST /api/generate`

运行完整多 Agent 流水线（同步返回）。

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
  "task_id": "a1b2c3d4",
  "status": "success",
  "result": {
    "planner_output": { "theme": "...", "video_type": "...", "..." : "..." },
    "copywriter_output": { "hook": { "text": "..." }, "body": [], "cta": {} },
    "scriptwriter_output": { "title": "...", "shots": [] },
    "visual_output": { "visual_style": {}, "shot_prompts": [] },
    "distributor_output": { "platform": "...", "publish_content": {} },
    "final_report": "# 青禾映画 · 短视频创作方案\n...",
    "error": null
  }
}
```

### `POST /api/generate/stream`

SSE 流式返回每个 Agent 执行进度（`node_update` / `error` / `complete` 事件）。

### `POST /api/agents/{step}`

执行单个 Agent 步骤。`{step}` 可选：`planner` / `copywriter` / `scriptwriter` / `visual_designer` / `distributor` / `report_generator`。

### `POST /api/text/polish`

AI 润写：将一句话创意补全为完整策划输入。

### `POST /api/images/generate`

AI 生图：根据 Prompt 生成图片。

### `POST /api/tts/generate`

语音合成：文本 → MP3。

### `POST /api/video/compose`

视频合成：图片列表 + 音频 → MP4。

### `POST /api/auth/register` / `POST /api/auth/login`

用户注册 / 登录，返回 JWT Token。

### `GET /api/health`

健康检查，返回 `{"status": "ok"}`。

---

## 流水线架构

```
用户输入（产品名 / 产地 / 卖点 / 平台 / 时长）
  │
  ▼
┌─────────────┐     ┌─────────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────────┐
│  策划 Agent  │ ──→ │  文案 Agent  │ ──→ │  脚本 Agent    │ ──→ │  视觉 Agent   │ ──→ │  投放 Agent   │
│  planner     │     │  copywriter  │     │  scriptwriter  │     │ visual_design │     │  distributor  │
└──────┬──────┘     └──────┬──────┘     └───────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                   │                    │                    │                    │
       │  错误时 ────────────────────────────────────────────────────────────────────→  报告生成
       │                   │                    │                    │                    │
       ▼                   ▼                    ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      report_generator                                          │
│                              整合所有输出 → Markdown 报告                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

任一节点写入 `error` 字段时，后续业务节点自动跳过，直接进入报告生成节点输出错误信息。

---

## 测试

```bash
cd qinghe-video

# 安装开发依赖
pip install -e ".[dev]"

# 运行测试（不需要 LLM API Key —— 仅校验模型、状态、图构建、Prompt 加载）
pytest tests/ -v
```

---

## 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_MODEL` | `gpt-4o-mini` | LLM 模型名称 |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容 API 地址 |
| `LLM_API_KEY` | *(必填)* | API Key |
| `LLM_TEMPERATURE` | `0.7` | 采样温度 |
| `LLM_MAX_TOKENS` | `2048` | 最大输出 token 数 |
| `APP_HOST` | `0.0.0.0` | 后端监听地址 |
| `APP_PORT` | `18739` | 后端端口 |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `SQLITE_PATH` | `qinghe.db` | SQLite 数据库文件 |
| `JWT_SECRET` | *(开发默认)* | JWT 签名密钥 |
| `JWT_EXPIRE_MINUTES` | `1440` | JWT 有效期（分钟） |
| `APILINK_API_BASE_URL` | `https://agaigw.com` | AI 生图中转站地址 |
| `AIAPIAL_API_KEY` | *(可选)* | 生图 API Key |
| `IMAGE_MODEL` | `doubao-seedream-5-0-260128` | 生图模型 |
| `IMAGE_SIZE` | `1920x1920` | 生成图片尺寸 |

---

## 已知限制

- **无持久化队列**：MVP 无任务队列，所有调用同步执行，长任务可能超时
- **无断点续跑**：刷新页面会丢失流水线进度（可通过 sessionStorage 部分恢复）
- **图片 URL 有时效**：生成的图片 URL 可能 24h 过期，需及时下载
- **JSON 修复依赖**：`json_repair` 已安装但当前由 LangChain 内部使用

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
- [ ] 引入 LangGraph checkpoint 支持断点续跑
- [ ] 增加人工审批节点（HITL）
- [ ] 接入真实 AI 视频生成接口
- [ ] 增加审核 Agent（合规校验）
- [ ] 历史方案存储与检索
- [ ] 多分支并行（同一产品生成多套方案）
- [ ] OSS 持久化生成素材

---

_青禾映画 — LangGraph 多 Agent 流水线驱动 · 让农业短视频创作像农事一样有条不紊_
