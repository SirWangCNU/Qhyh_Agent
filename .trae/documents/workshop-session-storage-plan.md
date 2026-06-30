# 工坊生成记录持久化 + 侧边栏分组计划

## 摘要

为分步工坊（Workshop）新增「多会话历史记录」能力：在后端新建 `workshop_sessions` 表持久化工坊状态快照，前端通过 `/api/workshop/sessions` CRUD 管理多条记录，侧边栏新增「工坊记录」独立分组，与现有「对话记录」（Plan）完全分开。整体架构严格复用 `canvas_projects` 已验证的「user_id FK + JSON 序列化 + CRUD 路由」模式。

## 当前状态分析

### 已有机制（保留不动）
- **侧边栏对话记录**：`localStorage["qinghe_plans"]` 存 `Plan[]`，`use-plans.ts` 提供 `createPlan/updatePlan/removePlan/getPlan` CRUD，URL `?planId=xxx` 驱动切换。`SidebarPlanList.tsx` 渲染列表。**无后端持久化**（本次不动，保持现状）。
- **工坊运行时状态**：`workshop-store.ts` 把单个 snapshot 写入 `sessionStorage["qinghe_workshop_state"]`，每个 mutating action 末尾手动 `persist(get())`。`App.tsx` 启动时 `hydrate()`。**单快照、无历史、关 tab 即丢**。

### 缺口（本计划解决）
1. 工坊无多记录/历史切换能力。
2. 工坊状态无后端持久化，跨设备/清缓存即丢。
3. 侧边栏只有「对话记录」一个分组，工坊记录无入口。

## 设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 存储载体 | 后端 SQLite `workshop_sessions` 表 | 用户已选；与 canvas_projects 一致，跨设备可靠 |
| 序列化方式 | 整体 JSON 存 `state_json` 列 | 复用 canvas 模式，简单可靠，单用户百记录性能足够 |
| 前端运行时缓存 | 保留 `sessionStorage["qinghe_workshop_state"]` 作运行时快照 | 刷新可恢复当前会话，与 canvas-store 的 `projectId` 指针 + sessionStorage 模式对齐 |
| 自动保存策略 | 步骤完成（done）后 debounce 2s 调 PUT | 复用 canvas 的 autosave 模式，避免每步 8 次 mutation 打爆后端 |
| 切换机制 | URL `?sessionId=xxx` 驱动 | 与 Plan 的 `?planId` 模式一致 |
| 侧边栏布局 | 两个独立分组：「对话记录」+「工坊记录」 | 用户已选；不混在一起，语义清晰 |

## 提议改动

### A. 后端：新增 `workshop_sessions` 模块

#### A1. 新建 `qinghe-video/src/workshop_sessions/persistence.py`
严格镜像 `src/canvas/persistence.py` 的结构：
- `WorkshopSessionORM`（`__tablename__ = "workshop_sessions"`）
  - `id: String(36)` PK（`uuid.uuid4().hex`）
  - `user_id: Integer` FK→users.id, index, nullable=False
  - `name: String(128)` nullable=False
  - `state_json: Text` nullable=False, default `"{}"` — 存完整工坊状态快照（见下方 schema）
  - `created_at: DateTime` default now
  - `updated_at: DateTime` default now, onupdate now
- CRUD 函数：`create_session / list_sessions / get_session / update_session / delete_session / to_response_dict`
- 所有查询带 `user_id` 归属校验（与 canvas 一致）
- `list_sessions` 返回 summary（不含 state_json，含 `step_progress` 摘要：从 state_json 提取 `steps` 计算完成数/总数，类似 canvas 的 `node_count`）

`state_json` 存储的 schema（即 workshop-store 当前 persist 的快照）：
```json
{
  "steps": {"planner": "done", ...},
  "stepOutputs": {...},
  "stepErrors": {...},
  "workshopState": {...GenerateResult},
  "mediaResults": {"characterImage": ..., "objectImage": ..., "sceneImage": ...},
  "autoRunToStep": 4,
  "currentStep": "planner",
  "form": {...UserInput},
  "oneLiner": "...",
  "topics": [...],
  "selectedTopicIndex": null,
  "selectedTopic": null
}
```

#### A2. 新建 `qinghe-video/src/workshop_sessions/models.py`
Pydantic v2 模型（镜像 `src/canvas/models.py` 风格）：
- `WorkshopSessionCreate { name: str }`（state 由后端从请求体另传或初始化空）
- `WorkshopSessionUpdate { name?: str, state?: dict }`
- `WorkshopSessionSummary { id, name, step_progress: str, updated_at }`
- `WorkshopSession { id, name, state: dict, created_at, updated_at }`

#### A3. 新建 `qinghe-video/src/workshop_sessions/router.py`
路由（全部 `Depends(get_current_user)`，镜像 canvas router）：
- `POST /api/workshop/sessions` — 创建（body: `WorkshopSessionCreate` + 可选 `state`）
- `GET /api/workshop/sessions` — 列表（返回 `WorkshopSessionSummary[]`）
- `GET /api/workshop/sessions/{session_id}` — 详情（返回完整 `WorkshopSession`）
- `PUT /api/workshop/sessions/{session_id}` — 更新 name 和/或 state
- `DELETE /api/workshop/sessions/{session_id}` — 删除

#### A4. 新建 `qinghe-video/src/workshop_sessions/__init__.py`
空 `__init__.py`（仿 canvas，不自动导入 router，避免 alembic env 加载 FastAPI 依赖链）。

#### A5. 新建 `qinghe-video/alembic/versions/004_create_workshop_sessions.py`
镜像 `003_create_canvas_projects.py`：
- `revision = "004_workshop"`
- `down_revision = "003_canvas"`
- `op.create_table("workshop_sessions", ...)` 含 `id/user_id/name/state_json/created_at/updated_at`
- `op.create_index("ix_workshop_sessions_user_id", ...)`

#### A6. 修改 `qinghe-video/src/main.py`
注册新 router：
```python
from src.workshop_sessions.router import router as workshop_sessions_router
app.include_router(workshop_sessions_router, prefix="/api/workshop/sessions", tags=["workroom-sessions"])
```
（在现有 `canvas_router` 注册后追加一行）

---

### B. 前端：新增会话管理 + 侧边栏分组

#### B1. 修改 `frontend/src/lib/constants.ts`
- `STORAGE_KEYS` 新增 `workshopSession: "qinghe_workshop_session"`（sessionStorage，存 `{ sessionId, name }` 指针，仿 canvas 的 `canvas` key）
- 保留现有 `workshop: "qinghe_workshop_state"`（运行时状态快照，不变）

#### B2. 修改 `frontend/src/types/api.ts`
新增类型（放在 Storyboard 类型块之后）：
```ts
export interface WorkshopSessionState {
  steps: Record<string, string>;
  stepOutputs: Record<string, unknown>;
  stepErrors: Record<string, string>;
  workshopState: GenerateResult;
  mediaResults: { characterImage: ConsistencyImageSlot | null; objectImage: ConsistencyImageSlot | null; sceneImage: ConsistencyImageSlot | null; };
  autoRunToStep: number;
  currentStep: string;
  form: UserInput;
  oneLiner: string;
  topics: TopicCandidate[];
  selectedTopicIndex: number | null;
  selectedTopic: TopicCandidate | null;
}
export interface WorkshopSessionSummary { id: string; name: string; step_progress: string; updated_at: string; }
export interface WorkshopSession { id: string; name: string; state: WorkshopSessionState; created_at: string; updated_at: string; }
export interface WorkshopSessionCreateRequest { name: string; state?: WorkshopSessionState; }
export interface WorkshopSessionUpdateRequest { name?: string; state?: WorkshopSessionState; }
```

#### B3. 新建 `frontend/src/hooks/use-workshop-sessions.ts`
镜像 `use-canvas.ts` 的 react-query 模式：
- `useWorkshopSessions()` — `useQuery` 列表
- `useCreateWorkshopSession()` — `useMutation` POST
- `useWorkshopSession(id)` — `useQuery` 单条详情
- `useUpdateWorkshopSession()` — `useMutation` PUT
- `useDeleteWorkshopSession()` — `useMutation` DELETE

#### B4. 修改 `frontend/src/stores/workshop-store.ts`
- 新增字段：`sessionId: string | null`
- 新增 action：
  - `loadSession(session: { id, name, state })` — 用后端返回的 state 覆盖当前 store，设置 sessionId，写 sessionStorage 指针
  - `setSessionId(id: string | null)` / `clearSession()`
- 修改 `persist()`：额外持久化 `sessionId` 到 sessionStorage 指针（仅 id+name，不存全部 state——全部 state 由后端负责）
  - 实际拆分：`persistSessionPointer(sessionId, name)` 写 `qinghe_workshop_session`；现有 `persist()` 继续写 `qinghe_workshop_state` 作运行时快照
- 修改 `hydrate()`：先读指针恢复 `sessionId`，再读运行时快照恢复其余字段（与 canvas-store 的 hydrate 一致）
- 修改 `reset()`：清空两个 sessionStorage key + sessionId

#### B5. 新建 `frontend/src/hooks/use-workshop-autosave.ts`
仿 canvas 的 `useCanvasAutosave` 模式：
- 监听 `workshop-store` 的 `dirty` 状态
- debounce 2s 后调 `useUpdateWorkshopSession`，传当前 store 快照作为 `state`
- 成功后 `markSaved()`
- 仅当 `sessionId !== null` 时触发
- 状态指示：`saveStatus: "idle" | "saving" | "saved" | "error"`（复用 canvas-store 已有的 SaveStatus 类型）

#### B6. 修改 `frontend/src/stores/workshop-store.ts`（追加）
- 新增 `dirty: boolean` / `saveStatus: SaveStatus` / `markDirty()` / `markSaved()` / `setSaveStatus(s)` 字段（仿 canvas-store）
- 在所有 mutating action 末尾调 `markDirty()`（替代直接 persist——persist 仍写运行时快照，autosave hook 监听 dirty 触发后端保存）

#### B7. 修改 `frontend/src/pages/WorkshopPage.tsx`
- 顶部读 `useSearchParams` 的 `sessionId`
- 挂载 effect：
  - 若 URL 有 `sessionId` 且与 store.sessionId 不同 → 调 `useWorkshopSession(sessionId)` 拉取 → `loadSession()`
  - 若无 `sessionId` 且 store 为空 → 显示空状态或引导新建
- 顶部按钮区新增「新建工坊」按钮：调 `useCreateWorkshopSession` 创建 → `loadSession` → `setSearchParams({ sessionId })`
- 顶部新增「重命名」入口（可选，初版可省）
- 引入 `useWorkshopAutosave()` hook
- 顶部展示 `saveStatus` 指示器（小字"已保存"/"保存中..."）

#### B8. 新建 `frontend/src/components/layout/SidebarWorkshopList.tsx`
镜像 `SidebarPlanList.tsx` 的结构：
- `useWorkshopSessions()` 拉列表
- 每条点击 → `navigate('/workshop?sessionId=' + id)`
- 当前激活项：URL 的 `sessionId` === `session.id` 高亮
- 右键/悬停删除按钮 → `useDeleteWorkshopSession` → 刷新列表
- 空状态提示"暂无工坊记录"

#### B9. 修改 `frontend/src/components/layout/Sidebar.tsx`
在现有 `SidebarPlanList` 之后追加 `SidebarWorkshopList`，并加分组标题：
```tsx
<SidebarHeader ... />
<SidebarNewPlan ... />
<SidebarProgress ... />
<div className="sidebar-group">
  <div className="sidebar-group__title">对话记录</div>
  <SidebarPlanList ... />
</div>
<div className="sidebar-group">
  <div className="sidebar-group__title">工坊记录</div>
  <SidebarWorkshopList ... />
</div>
```
（分组标题样式复用现有 `eyebrow` 或新增 `.sidebar-group__title` 类）

#### B10. 修改 `frontend/src/components/layout/SidebarNewPlan.tsx`（可选）
当前「新建方案」FAB 只创建对话 Plan。考虑：
- 方案 A（推荐，初版）：保持只新建对话 Plan，工坊新建入口放 WorkshopPage 顶部
- 方案 B：FAB 弹出菜单让用户选「新建对话」/「新建工坊」

初版选方案 A，降低改动面。

---

### C. App 启动恢复

#### C1. 修改 `frontend/src/App.tsx`
现有 `useWorkshopStore.getState().hydrate()` 保留。hydrate 内部会先恢复 `sessionId` 指针，WorkshopPage 挂载时根据 sessionId 决定是否从后端拉取完整数据。

---

## 假设与边界

1. **不动现有 Plan/localStorage 机制**：侧边栏对话记录仍走 `use-plans.ts` + localStorage，本次只新增工坊的后端持久化，不重构 Plan。
2. **不迁移历史 sessionStorage 数据**：现有用户的 `qinghe_workshop_state` 运行时快照保留作恢复当前会话用，但不自动转成后端 session。用户需手动点「新建工坊」首次落库。
3. **state_json 大小**：单条工坊状态预估 < 100KB（LLM 输出 + 一致性图 URL，不含图片二进制）。SQLite Text 列无压力。
4. **自动保存节流**：debounce 2s + 仅在步骤 done 后触发，避免 `setForm` 这类高频 mutation 打爆后端。
5. **鉴权**：所有 `/api/workshop/sessions/*` 走 `Depends(get_current_user)`，按 `user_id` 行级隔离，与 canvas/assets 一致。
6. **文件规模**：新增后端 4 文件 + 前端 3 文件，修改 6 文件，单文件均 < 300 行，符合 500 行上限规范。

## 验证步骤

### 后端验证
1. `cd qinghe-video && alembic upgrade head` — 确认 `004_workshop` 迁移成功，`workshop_sessions` 表创建
2. `pytest tests/ -v` — 现有测试不应回归
3. 启动后端，用 curl/JWT 测试 CRUD：
   ```bash
   # 创建
   curl -X POST http://localhost:18739/api/workshop/sessions -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"测试工坊"}'
   # 列表
   curl http://localhost:18739/api/workshop/sessions -H "Authorization: Bearer <token>"
   # 详情
   curl http://localhost:18739/api/workshop/sessions/<id> -H "Authorization: Bearer <token>"
   # 更新
   curl -X PUT http://localhost:18739/api/workshop/sessions/<id> -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"state":{"steps":{"planner":"done"}}}'
   # 删除
   curl -X DELETE http://localhost:18739/api/workshop/sessions/<id> -H "Authorization: Bearer <token>"
   ```
4. 未带 token 访问应返回 401；访问他人 session 应返回 404

### 前端验证
1. `cd qinghe-video/frontend && npx tsc --noEmit` — 无类型错误
2. `npm run dev` 启动前端
3. **新建流程**：进入 /workshop → 点「新建工坊」→ 侧边栏「工坊记录」出现新条目 → URL 变为 `/workshop?sessionId=xxx`
4. **自动保存**：跑完 planner 步骤 → 顶部显示「保存中...」→「已保存」→ 刷新页面 → 状态恢复
5. **切换记录**：在侧边栏点击另一条工坊记录 → WorkshopPage 加载该 session 的完整状态 → 步骤进度/表单/输出均恢复
6. **删除记录**：侧边栏工坊条目删除按钮 → 列表移除 → 若删的是当前 session，跳转空状态
7. **分组隔离**：侧边栏「对话记录」和「工坊记录」各自独立，互不影响；对话记录的 Plan 仍走 localStorage
8. **跨设备**：在浏览器 A 创建工坊记录 → 浏览器 B 登录同账号 → 侧边栏能看到该记录

## 实现顺序建议

1. 后端：迁移 + ORM + router（A1-A6）→ curl 验证 CRUD
2. 前端类型 + hook（B1-B3）
3. 前端 store 改造 + autosave（B4-B6）
4. 前端 WorkshopPage 集成（B7）
5. 前端侧边栏分组 + WorkshopList（B8-B10）
6. 端到端验证

## 关键文件清单

**新增（后端）**：
- `qinghe-video/src/workshop_sessions/__init__.py`
- `qinghe-video/src/workshop_sessions/persistence.py`
- `qinghe-video/src/workshop_sessions/models.py`
- `qinghe-video/src/workshop_sessions/router.py`
- `qinghe-video/alembic/versions/004_create_workshop_sessions.py`

**新增（前端）**：
- `qinghe-video/frontend/src/hooks/use-workshop-sessions.ts`
- `qinghe-video/frontend/src/hooks/use-workshop-autosave.ts`
- `qinghe-video/frontend/src/components/layout/SidebarWorkshopList.tsx`

**修改**：
- `qinghe-video/src/main.py`（注册 router）
- `qinghe-video/frontend/src/lib/constants.ts`（STORAGE_KEYS）
- `qinghe-video/frontend/src/types/api.ts`（新增类型）
- `qinghe-video/frontend/src/stores/workshop-store.ts`（sessionId + dirty + loadSession）
- `qinghe-video/frontend/src/pages/WorkshopPage.tsx`（URL 驱动 + 新建/autosave）
- `qinghe-video/frontend/src/components/layout/Sidebar.tsx`（分组）
