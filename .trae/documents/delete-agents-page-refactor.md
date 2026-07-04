# 计划：删除 Agent 管理页面 + 清理无用代码

## 概述

删除前端 `AgentsPage`（Agent 管理页面，路由 `#/agents`），清理所有指向该页面的导航入口和路由注册。后端无需改动（`POST /api/agents/{step}` 端点被 WorkshopPage 和 ChatPage 共享，必须保留）。

## 当前状态分析

### AgentsPage 是什么

`pages/AgentsPage.tsx`（361 行）是一个**独立调试页面**，允许用户单独运行 6 个 Agent 中的任意一个（每次调用传空 state `{}`，不串联流水线）。它与 WorkshopPage（累计 state 串联多步）功能高度重叠。

### 依赖关系图（关键发现）

```
AgentsPage.tsx  ← 唯一消费者（待删除）
  ├─ useRunAgentStep()     → 也被 WorkshopPage + use-chat-pipeline 共享 ✅保留
  ├─ AgentOutputView       → 也被 WorkshopStepDetail 共享 ✅保留
  ├─ resolveMediaUrl()     → 也被 ConsistencyCard/AssetCard/AssetPreviewModal 共享 ✅保留
  ├─ NODE_ORDER            → 也被 pipeline-store/use-generate-stream/PipelineFlow 共享 ✅保留
  ├─ NODE_META             → 也被 use-chat-pipeline/PipelineNode 共享 ✅保留
  └─ ROUTES.agents         → 仅被 NAV_LINKS + Footer 引用 ❌可删
```

**结论**：删除 AgentsPage 后不会产生新的死代码。所有共享组件和 hooks 都有其他活跃消费者。

### 后端影响

- `POST /api/agents/{step}`（`agent_steps.py`）→ 被 WorkshopPage 和 ChatPage 共享，**不能删除**
- `@app.get("/agents")` SPA 路由 → 仅为 AgentsPage 服务，**可删除**
- `nodes/`、`models.py`、`graph.py` → 核心 pipeline，**不能删除**

## 改动清单

### 1. 删除页面文件

| 操作 | 文件 |
|------|------|
| **删除** | `frontend/src/pages/AgentsPage.tsx` |

### 2. 移除路由注册

**文件**: `frontend/src/routes/index.tsx`

- 删除第 8 行：`import { AgentsPage } from "@/pages/AgentsPage";`
- 删除第 28 行：`{ path: "agents", element: <AgentsPage /> },`

### 3. 移除导航入口

**文件**: `frontend/src/lib/constants.ts`

- 删除第 128 行：`agents: "/agents",`（从 ROUTES 对象中移除）
- 删除第 143 行：`{ to: ROUTES.agents, label: "Agent 管理", route: ROUTES.agents },`（从 NAV_LINKS 中移除）

**文件**: `frontend/src/components/layout/Footer.tsx`

- 删除第 15 行：`{ to: ROUTES.agents, label: "Agent 管理" },`（从页脚 links 数组中移除）

### 4. 移除后端 SPA 路由

**文件**: `src/main.py`

- 删除第 147 行：`@app.get("/agents", summary="Agent 管理页面")` 装饰器（`spa_routes()` 函数本身保留，仅移除这一行装饰器）

## 不需要改动的文件（共享代码，保留）

| 文件 | 保留原因 |
|------|----------|
| `hooks/use-agents.ts` | `useRunAgentStep` 被 WorkshopPage + use-chat-pipeline 共享；`resolveMediaUrl` 被 5 个组件共享 |
| `components/agent/AgentOutputView.tsx` | 被 WorkshopStepDetail 共享 |
| `types/api.ts`（`AgentStepRequest`/`AgentStepResponse`） | 被 use-agents.ts 使用 |
| `lib/constants.ts`（`NODE_ORDER`/`NODE_META`/`NodeKey`） | 被 6+ 个模块共享 |
| `src/agent_steps.py` | 后端单步执行逻辑，被 WorkshopPage 和 ChatPage 共享 |
| `src/main.py` 中 `POST /api/agents/{step}` | 共享 API 端点 |

## 验证步骤

1. **TypeScript 类型检查**：`cd frontend && npx tsc --noEmit` — 确认无类型错误
2. **前端构建**：`npm run build` — 确认 Vite 构建成功
3. **后端测试**：`cd .. && pytest tests/ -v` — 确认后端无回归
4. **手动验证**：启动前后端，确认导航栏和页脚不再显示"Agent 管理"，访问 `/#/agents` 应被通配路由重定向到 `/create`
