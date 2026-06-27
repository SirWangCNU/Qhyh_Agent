# 对话式视频创作工作室 Spec

## Why

当前 `qinghe-video` 前端以表单 + 分步工坊为主，用户需要主动填写大量字段并逐个点击 Agent 步骤。为了降低使用门槛、提升沉浸感，需要新增一套类似 ChatGPT 的对话式创作入口：用户通过自然语言与系统多轮交互即可生成视频方案；同时把「规划设计」与「Agent 调用管理」拆分为独立子页面，让不同角色（创作者 / 管理员）有清晰的入口与视图。

## What Changes

- 新增对话式创作页面 `/chat`：类 ChatGPT 气泡对话，支持用户输入农产品信息、追问、一键确认生成
- 新增规划设计页面 `/plan`：项目/方案草稿列表、结构化展示已生成的方案概览、可新建/删除/继续编辑方案
- 新增 Agent 管理页面 `/agents`：展示全部 6 个 Agent 卡片，支持单 Agent 调用、查看参数与产物、开关/配置 Agent（前端层面）
- 在主导航增加三个入口：「对话创作」「规划设计」「Agent 管理」
- 新增前端路由脚本 `router.js`：基于 hash 切换页面（`#/chat`、`#/plan`、`#/agents`），保持单页体验
- 新增三个页面的独立 JS/CSS 模块：
  - `chat.js` / `chat.css`
  - `plan.js` / `plan.css`
  - `agents.js` / `agents.css`
- 后端复用现有 Agent 端点：`POST /api/agents/{step}`、`POST /api/generate/stream`、`POST /api/video/mvp` 等
- 新增或复用 FastAPI 路由返回对应 HTML：`
  - `/chat` 返回前端页面（index.html 中已包含对应 section 或通过独立 html）
  - 更简单地：仍由单页 index.html 提供，通过 hash 路由显示不同 section
- 不新增后端数据库，规划设计数据保存在 `localStorage`
- 不破坏现有分步工坊页面 `#workshop`，与之并存

## Impact

- Affected code:
  - `qinghe-video/frontend/index.html`（新增导航、新增 page section）
  - `qinghe-video/frontend/assets/js/router.js`（新增）
  - `qinghe-video/frontend/assets/js/chat.js`（新增）
  - `qinghe-video/frontend/assets/js/plan.js`（新增）
  - `qinghe-video/frontend/assets/js/agents.js`（新增）
  - `qinghe-video/frontend/assets/css/chat.css`（新增）
  - `qinghe-video/frontend/assets/css/plan.css`（新增）
  - `qinghe-video/frontend/assets/css/agents.css`（新增）
  - `qinghe-video/frontend/assets/css/style.css`（导航与 page 容器微调）
  - `qinghe-video/src/main.py`（可选：新增 `/chat`、`/plan`、`/agents` 返回同一 index.html）
- 不涉及 LLM prompt、模型、数据库变更

## ADDED Requirements

### Requirement: 对话式创作页面
前端 SHALL 提供 `/chat`（`#/chat`）页面，以对话气泡形式引导用户完成农产品短视频创作。

#### Scenario: 首次进入
- **WHEN** 用户访问 `#/chat`
- **THEN** 页面显示欢迎语 + 快捷提示按钮（如「为阳山水蜜桃生成 30 秒抖音视频」）

#### Scenario: 用户发送需求
- **WHEN** 用户在输入框输入农产品信息并发送
- **THEN** 系统以流式/非流式方式调用后端，逐步返回 Agent 产物，并以消息卡片形式展示在对话中

#### Scenario: 多轮追问
- **WHEN** 用户继续输入「换成 60 秒版本」「强调产地溯源」等追问
- **THEN** 系统在新的消息中继续调用相关 Agent，保持上下文

#### Scenario: 一键成片
- **WHEN** 对话中生成完整方案后，用户点击「一键成片」
- **THEN** 调用 `POST /api/video/mvp`，返回视频播放器与下载按钮

### Requirement: 规划设计页面
前端 SHALL 提供 `/plan`（`#/plan`）页面，用于管理创作项目/方案草稿。

#### Scenario: 项目列表
- **WHEN** 用户访问 `#/plan`
- **THEN** 展示 localStorage 中保存的方案列表（名称、创建时间、当前进度、缩略状态）

#### Scenario: 新建方案
- **WHEN** 用户点击「新建方案」
- **THEN** 跳转至 `#/chat` 开始新的对话创作

#### Scenario: 继续编辑
- **WHEN** 用户点击某个方案
- **THEN** 跳转至 `#/chat?planId=xxx` 恢复该对话状态

#### Scenario: 删除方案
- **WHEN** 用户点击删除
- **THEN** 从 localStorage 移除该方案并刷新列表

### Requirement: Agent 管理页面
前端 SHALL 提供 `/agents`（`#/agents`）页面，用于单独查看、调用和管理每个 Agent。

#### Scenario: Agent 列表
- **WHEN** 用户访问 `#/agents`
- **THEN** 以卡片网格展示 6 个 Agent：头像、名称、描述、最近一次调用状态

#### Scenario: 单 Agent 调用
- **WHEN** 用户选择某个 Agent 并填写输入参数（复用顶部农产品表单）
- **THEN** 调用 `POST /api/agents/{step}`，在页面右侧展示结构化产物

#### Scenario: Agent 状态提示
- **WHEN** Agent 调用中/成功/失败
- **THEN** 卡片显示对应状态徽章（loading / success / error）

### Requirement: 前端路由
前端 SHALL 支持基于 URL hash 的单页路由切换。

#### Scenario: 直接访问
- **WHEN** 用户访问 `/#/chat`、`#/plan`、`#/agents`、`#/workshop`
- **THEN** 页面正确显示对应 section，其余 section 隐藏

#### Scenario: 导航切换
- **WHEN** 用户点击顶部导航
- **THEN** URL hash 变化，对应页面无刷新切换

## MODIFIED Requirements

### Requirement: 顶部导航
原导航包含「创作」「分步工坊」「流水线」「方案」「关于」。修改为：
- 「对话创作」→ `#/chat`
- 「分步工坊」→ `#/workshop`（保留现有）
- 「规划设计」→ `#/plan`
- 「Agent 管理」→ `#/agents`
- 「关于」→ `#/about`
- （可选）保留「流水线」作为 `#/pipeline` 或合并到分步工坊

## REMOVED Requirements

无。
