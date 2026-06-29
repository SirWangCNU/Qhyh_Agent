# 青禾映画 · 产品需求文档 (PRD)

> 面向农户和农业合作社的多 Agent 协同短视频智能创作平台。
> 本文档记录已确认的产品需求、功能规格与产品决策。

---

## 1. 产品概述

### 1.1 一句话描述

用户只需输入农产品基本信息，系统通过 **5 个 AI Agent 流水线协作**，自动生成一套完整的短视频创作方案（策划 → 文案 → 分镜脚本 → AI 视觉 Prompt → 投放策略），并支持 **AI 出图、语音配音、视频合成** 一站式出片。

### 1.2 目标用户

- **主要用户**：农户、农业合作社、农产品电商从业者
- **使用场景**：为农产品（水果、蔬菜、粮油、特产等）快速生成短视频营销素材与发布方案
- **核心痛点**：
  - 缺乏专业的短视频策划与文案能力
  - 不熟悉 AI 绘图/视频工具
  - 不了解不同平台（抖音/快手/视频号）的投放规则

### 1.3 核心价值

1. **零门槛创作**：一句话创意即可触发完整方案生成
2. **全流程覆盖**：从选题、策划到成片、投放策略一站式完成
3. **可人工干预**：分步工坊支持自动/手动执行，每步可重试
4. **结果可落地**：直接输出口播文案、分镜脚本、AI 生图 Prompt、平台标题标签、可播放视频

---

## 2. 核心业务流程

```
用户输入（产品名 / 产地 / 品类 / 卖点 / 平台 / 时长）
    │
    ▼
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  策划 Agent  │ →  │  文案 Agent  │ →  │  脚本 Agent   │ →  │  视觉 Agent   │ →  │  投放 Agent   │
│  planner     │    │  copywriter  │    │  scriptwriter │    │ visual_design │    │  distributor  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       └──── 任一节点出错 ─────────────────────────────────────────────────────→ 报告生成
       ▼                  ▼                  ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                   report_generator                                    │
│                           整合所有输出 → Markdown 报告                                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**关键规则**：任一节点写入 `error` 字段时，后续业务节点自动跳过，直接进入 `report_generator` 输出错误信息。

---

## 3. 功能模块

### 3.1 多 Agent 流水线（核心）

| Agent | 职责 | 输出 |
|-------|------|------|
| `planner` | 分析产品、确定主题、受众、卖点、情绪基调 | 策划方案 |
| `copywriter` | 撰写 Hook、口播正文、CTA | 口播文案 |
| `scriptwriter` | 将文案拆解为分镜脚本 | 分镜表、BGM 建议 |
| `visual_designer` | 将画面描述转为 AI 生图/生视频 Prompt | 视觉风格、逐镜 Prompt |
| `distributor` | 根据平台特性优化标题、标签、发布时间 | 投放方案 |
| `report_generator` | 整合所有输出为可读报告 | Markdown 报告 |

**非功能要求**：
- 所有 Agent 输出经 Pydantic v2 严格校验
- 支持通过 `.env` 切换 LLM 提供商（OpenAI / DeepSeek / Qwen 等）

### 3.2 开始创作（SSE 一键流水线）

- 路由：`/#/create`
- 用户填写产品信息后，一键触发完整流水线
- 通过 SSE 实时推送每个 Agent 的执行进度（`node_start` / `node_update` / `error` / `complete`）

### 3.3 对话创作

- 路由：`/#/chat`
- Chat 式交互，输入一句话创意即可自动编排完整创作方案
- 支持一键成片（`video_mvp`）

### 3.4 分步工坊（Workshop）

- 路由：`/#/workshop`
- 8 步农事工序卡片网格，支持：
  - 勾选“自动执行到此步”
  - 手动单步执行/重试
  - 步骤状态可视化（等待中/执行中/完成/失败）

| 步骤 | Key | 名称 | 依赖 | 执行类型 | 默认自动 |
|------|-----|------|------|----------|----------|
| 1 | `planner` | 策划 | 表单输入 | LLM Agent | ☑ |
| 2 | `copywriter` | 文案 | 策划 | LLM Agent | ☑ |
| 3 | `scriptwriter` | 脚本 | 文案 | LLM Agent | ☑ |
| 4 | `visual_designer` | 视觉 | 脚本 | LLM Agent | ☑ |
| 5 | `distributor` | 投放 | 视觉 | LLM Agent | ☐ |
| 6 | `image_gen` | 出图 | 视觉 | 图片生成 | ☐ |
| 7 | `tts` | 配音 | 文案 | TTS | ☐ |
| 8 | `compose` | 合成 | 出图+配音 | 视频合成 | ☐ |

### 3.5 AI 选题

- 在工坊策划步骤前接入
- 用户输入「产品名 + 一句话创意」，LLM 生成 6 个爆款候选主题
- 用户选择后自动回填并触发润写，再进入 planner
- **决策**：选题作为独立 LLM 服务实现，不入 LangGraph 图

### 3.6 AI 润写

- 将用户的一句话创意扩展为完整表单（产品名、产地、品类、卖点、平台、时长等）
- 作为独立服务（`text_polish.py`），不入 LangGraph 图

### 3.7 图像工作室

- 路由：`/#/image-studio`
- 9 宫格导演板：上传参考图，LLM 生成 9 个风格变体 Prompt，并发图生图，拼成 3×3 网格
- **决策**：保留独立页面，不嵌入 workshop，便于后续接入主流程

### 3.8 鉴权系统

- JWT + SQLite + Alembic
- 默认管理员账号通过迁移脚本注入
- 所有业务接口（除 `/api/health`）需 `Authorization: Bearer <token>`

### 3.9 Agent 管理

- 路由：`/#/agents`
- 查看各 Agent 配置信息与 Prompt 概要

### 3.10 方案详情

- 路由：`/#/plan`
- 查看已生成的创作方案

---

## 4. 已确认产品决策

以下决策来自 `.trae/documents/` 中的方案文档，已归档为当前产品的既定设计。

| 决策 | 说明 | 来源 |
|------|------|------|
| 前端技术栈 | React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Zustand + TanStack Query | [react-frontend-rebuild-plan.md](../.trae/documents/react-frontend-rebuild-plan.md) |
| 前端路由 | `createHashRouter`，保持 `#/create` 等 URL 兼容旧版 | [react-frontend-rebuild-plan.md](../.trae/documents/react-frontend-rebuild-plan.md) |
| 图像工作室位置 | 保留独立页面 `#/image-studio`，不嵌入 workshop | [image-studio-position-decision.md](../.trae/documents/image-studio-position-decision.md) |
| 工坊 8 步设计 | planner→copywriter→scriptwriter→visual_designer→distributor→image_gen→tts→compose | [step-pipeline-workshop-redesign-plan.md](../.trae/documents/step-pipeline-workshop-redesign-plan.md) |
| 工坊默认自动执行到第 4 步 | 媒体生成步骤（出图/配音/合成）默认手动，避免意外成本 | [step-pipeline-workshop-redesign-plan.md](../.trae/documents/step-pipeline-workshop-redesign-plan.md) |
| 选题功能形态 | 独立 LLM 服务，前端在 `PlannerCardBody` 接入，不入 LangGraph | [topic-selection-feature.md](../.trae/documents/topic-selection-feature.md) |
| 鉴权方案 | SQLite + SQLAlchemy + Alembic + JWT，Token 存 `localStorage` | [sqlite-jwt-auth-plan.md](../.trae/documents/sqlite-jwt-auth-plan.md) |
| 静态输出公开 | `/outputs/*` 保持公开，文件名含随机熵 | [sqlite-jwt-auth-plan.md](../.trae/documents/sqlite-jwt-auth-plan.md) |
| 模型字段严格校验 | 所有 Pydantic 输出模型 `extra="forbid"` | AGENTS.md / 代码规范 |

---

## 5. 待确认问题 / 开放问题

| 编号 | 问题 | 状态 | 备注 |
|------|------|------|------|
| Q1 | 历史方案是否需要持久化到数据库？当前仅 sessionStorage | 待确认 | 影响后端表设计 |
| Q2 | 是否接入真实 AI 视频生成（替代图片轮播）？ | 待确认 | 依赖第三方 API 成本 |
| Q3 | 图像工作室的「用此素材开始创作」衔接按钮是否要实现？ | 待确认 | [image-studio-position-decision.md](../.trae/documents/image-studio-position-decision.md) 建议为可选增强 |
| Q4 | 是否需要多分支并行（同一产品生成多套方案）？ | 待确认 | 迭代计划中有，但优先级未定 |
| Q5 | 素材 OSS 持久化方案选型？ | 待确认 | 当前为本地 `/outputs/` |
| Q6 | 是否需要登录失败限速、刷新令牌（refresh token）？ | 待确认 | 当前 JWT 24h 过期 |

---

## 6. 迭代计划

### 6.1 已完成

- [x] 多 Agent 流水线（策划 → 文案 → 脚本 → 视觉 → 投放）
- [x] 分步工坊（卡片网格化，手动/自动执行）
- [x] SSE 流式进度推送
- [x] AI 出图（Doubao Seedream）
- [x] 语音配音（Edge-TTS）
- [x] 视频合成（MoviePy）
- [x] 用户鉴权（JWT + SQLite）
- [x] 图像工作室（9 宫格导演板）
- [x] React 前端重构
- [x] AI 选题功能

### 6.2 规划中

- [ ] LangGraph checkpoint 断点续跑
- [ ] 人工审批节点（HITL）
- [ ] 接入真实 AI 视频生成接口
- [ ] 审核 Agent（合规校验）
- [ ] 历史方案存储与检索
- [ ] 多分支并行（同一产品生成多套方案）
- [ ] OSS 持久化生成素材

---

## 7. 非功能需求

| 维度 | 要求 |
|------|------|
| 代码规范 | 每个文件 ≤ 500 行，超出需拆分 |
| 测试 | 单元测试不依赖 LLM API Key，覆盖模型、状态、图构建、Prompt 加载、鉴权 |
| 部署 | 支持本地开发（Vite + uvicorn）与生产构建（FastAPI serve `frontend/dist`） |
| 配置 | 所有外部依赖（LLM、图片生成、JWT、DB）通过 `.env` 配置 |
| 兼容性 | 后端接口保持 OpenAI-compatible，模型可一键切换 |

---

## 8. 相关文档

- [API 接口文档](./api/endpoints.md)
- [提示词与设计文档](./design/prompts.md)
- [项目根目录 README](../README.md)
- [开发规范](../AGENTS.md)
- [过程方案归档](../.trae/documents/)
