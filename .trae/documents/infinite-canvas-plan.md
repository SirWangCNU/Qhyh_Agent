# 无限画布功能实现方案

> 形态：**混合**（自由画布为主 + 可选连线表达参考关系）
> 定位：**新增独立 `/canvas` 页面**，不改动现有 image-studio 与 workshop

---

## 一、调研结论（主流方案对标）

| 平台 | 形态 | 核心机制 | 借鉴点 |
|---|---|---|---|
| **即梦 AI** | 自由画布（Figma/PS 风格） | 左工具栏 + 中央无限画布；参考图四维解耦（内容/风格/结构/姿态）；局部重绘/扩图/抠图；预测式交互（生成后推荐"扩图/转视频"） | 工具栏布局、参考图分类标签、节点预测式推荐 |
| **可灵 AI 3.0** | 表单 + 多图参考 | 10 图多参考（人物/风格/结构三类）；Inpainting（mask + 文本 + 重绘强度 0–1.0） | 多参考图按类型分组、重绘强度滑杆 |
| **Krea Nodes** | 节点工作流 | 节点 + 连线表达依赖；实时预览（50ms）；社区模板 | 连线表达依赖关系、节点可串联迭代 |
| **infinite-canvas（CSDN 拆解）** | 节点 + 连线 | 五层架构；localForage 本地优先；上下文可追溯 | 本地优先 + 自动保存、上下文血缘 |

**技术选型**：[React Flow](https://reactflow.dev) (`@xyflow/react`)
- 成熟、TS 友好、自定义节点 + `Handle` 连接点、`screenToFlowPosition` 拖拽落点转换
- 与现有 shadcn/ui + Tailwind 风格兼容
- 500 节点内性能充足；若未来需 5000+ 可 drop-in 替换为 `@infinit-canvas/react`（同 API，OffscreenCanvas + Web Worker 渲染）
- 官方 DnD 示例成熟：HTML Drag and Drop API + `screenToFlowPosition`

**本项目现状**：React 18 + TS + Vite + shadcn/ui + zustand + react-query，**无任何画布/拖拽库**；后端已有 `image_generation.py`（doubao-seedream gateway）、`image_studio/`、`auth/`（JWT）、`db/`（SQLAlchemy + SQLite + Alembic）。可全部复用。

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端  /canvas  (CanvasPage)                                 │
│  ┌──────────┬───────────────────────────┬──────────────┐   │
│  │ 工具栏    │  ReactFlow 无限画布        │ 节点属性面板  │   │
│  │ (左)     │  - 自定义节点              │ (右, 抽屉)   │   │
│  │ 拖拽源    │  - Handle 连线             │              │   │
│  │          │  - Background/Controls/MiniMap │           │   │
│  └──────────┴───────────────────────────┴──────────────┘   │
│       ↕ zustand canvas-store (local 优先)                   │
│       ↕ react-query (自动保存 / 加载)                        │
├─────────────────────────────────────────────────────────────┤
│  后端  src/canvas/                                           │
│  router.py  →  CRUD 画布项目                                 │
│  service.py →  生成编排（收集入边输入 → 调 image_generation）│
│  models.py  →  Pydantic 模型                                 │
│  persistence.py →  SQLAlchemy                                │
├─────────────────────────────────────────────────────────────┤
│  复用：auth/ (JWT)  ·  db/ (SQLite + Alembic)                │
│        image_generation.py (doubao-seedream gateway)         │
│        outputs/ 静态目录（生成图托管）                        │
└─────────────────────────────────────────────────────────────┘
```

**核心设计原则**（来自 infinite-canvas 拆解）：
1. **创作是链路，不是单点请求** —— 节点 + 连线记录依赖关系
2. **上下文比模型更重要** —— 每张生成图可追溯到参考图与提示词
3. **本地优先** —— zustand 即时响应，debounce 同步后端

---

## 三、数据模型

### 3.1 React Flow 节点类型（4 种自定义节点）

| type | 用途 | data 字段 | Handle |
|---|---|---|---|
| `referenceImage` | 参考图（上传/拖入） | `{ imageUrl, uploadId, refType: 'content'\|'style'\|'structure'\|'pose', label }` | source (右/下) |
| `prompt` | 文本提示词 | `{ text, negativePrompt? }` | source (右/下) |
| `generate` | 生成任务（核心） | `{ status: 'idle'\|'running'\|'done'\|'error', resultImageUrl?, params, error?, startedAt? }` | target (左/上) + source (右/下) |
| `image` | 纯图片（生成结果落盘 / 上传素材） | `{ imageUrl, source: 'generated'\|'uploaded', parentId? }` | target (可选) |

> **生成节点是核心**：它的 target handle 接收任意数量的 `referenceImage` + `prompt` 入边；点击"生成"时，前端收集所有入边源节点的 data，组装请求发给后端；生成完成后写入 `resultImageUrl`，并可选自动派生一个 `image` 节点连出。

### 3.2 连线（edge）
React Flow 原生 edge，`source`/`target`/`id` 即可，不强制 type。可选 `animated: true` 表示数据流。

### 3.3 画布项目（后端持久化）

```python
# src/canvas/models.py
class CanvasProject(BaseModel):
    id: str                       # uuid
    name: str
    nodes: list[dict]             # React Flow nodes 原样序列化
    edges: list[dict]             # React Flow edges 原样序列化
    viewport: dict                # { x, y, zoom }
    created_at: datetime
    updated_at: datetime

class CanvasProjectSummary(BaseModel):
    id: str
    name: str
    thumbnail_url: str | None     # 取首个 generate 节点的 resultImageUrl
    updated_at: datetime

class GenerateRequest(BaseModel):
    node_id: str                  # 要触发的生成节点
    references: list[ReferenceInput]   # 收集自入边
    prompt: str
    negative_prompt: str | None = None
    params: dict                  # size/model 等

class ReferenceInput(BaseModel):
    image_url: str
    ref_type: Literal['content', 'style', 'structure', 'pose']
```

### 3.4 数据库表

```sql
-- alembic/002_create_canvas_projects.py
CREATE TABLE canvas_projects (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    name        TEXT NOT NULL,
    nodes       TEXT NOT NULL,      -- JSON
    edges       TEXT NOT NULL,      -- JSON
    viewport    TEXT,               -- JSON
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_canvas_user ON canvas_projects(user_id);
```

---

## 四、后端实现

### 4.1 新增文件（均 < 500 行）

```
src/canvas/
├── __init__.py
├── router.py            # FastAPI router，CRUD + generate
├── models.py            # Pydantic 模型
├── service.py           # 业务逻辑（收集入边、调 image_generation）
├── persistence.py       # CanvasProject ORM 模型 + 查询函数
└── upload.py            # 参考图上传（保存到 outputs/canvas/）
```

### 4.2 API 设计（全部走 `Depends(get_current_user)`）

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/canvas/projects` | 创建空项目 |
| GET | `/api/canvas/projects` | 列出当前用户项目（summary） |
| GET | `/api/canvas/projects/{id}` | 获取完整项目（nodes/edges/viewport） |
| PUT | `/api/canvas/projects/{id}` | 更新（自动保存，debounce 2s 触发） |
| DELETE | `/api/canvas/projects/{id}` | 删除 |
| POST | `/api/canvas/projects/{id}/generate` | 触发指定生成节点 |
| POST | `/api/canvas/upload` | 上传参考图（返回 url + uploadId） |

### 4.3 生成编排（`service.py` 核心逻辑）

```python
# 伪代码
async def run_generate(project_id, req: GenerateRequest, user):
    project = get_project(project_id, user)
    # 1. 按 ref_type 分组多参考图
    refs_by_type = group_by(req.references, key=lambda r: r.ref_type)
    # 2. 调用现有 image_generation.py（扩展支持多参考图）
    result_url = await image_generation.generate_with_references(
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        content_refs=[r.image_url for r in refs_by_type.get('content', [])],
        style_refs=[r.image_url for r in refs_by_type.get('style', [])],
        structure_refs=[r.image_url for r in refs_by_type.get('structure', [])],
        params=req.params,
    )
    # 3. 更新生成节点 data.resultImageUrl + status='done'
    update_node_data(project_id, req.node_id, {
        'status': 'done',
        'resultImageUrl': result_url,
        'startedAt': now_iso(),
    })
    return {'node_id': req.node_id, 'result_image_url': result_url}
```

### 4.4 复用与扩展 `image_generation.py`

现有 `image_generation.py` 走 doubao-seedream OpenAI-compatible gateway，已支持单参考图。**扩展点**：新增 `generate_with_references()` 函数，把多参考图按 ref_type 拼装到 prompt 上下文或 API 的 reference 字段（取决于 gateway 能力；若 gateway 不支持多图，则降级为"主参考图 + 文字描述其他参考特征"）。

> 决策：先实现 **content 主参考图 + style/structure 文字描述降级**，后续 gateway 升级再切原生多图。这样不阻塞前端流程。

### 4.5 路由注册

`src/main.py` 挂载：
```python
from src.canvas.router import router as canvas_router
app.include_router(canvas_router, prefix="/api/canvas", tags=["canvas"])
```

---

## 五、前端实现

### 5.1 依赖安装

```bash
cd qinghe-video/frontend
npm install @xyflow/react
```

### 5.2 目录结构

```
frontend/src/
├── pages/CanvasPage.tsx                       # 画布主页（容器 + 路由出口）
├── components/canvas/
│   ├── CanvasFlow.tsx                         # ReactFlow 容器（核心）
│   ├── nodes/
│   │   ├── ReferenceImageNode.tsx             # 参考图节点
│   │   ├── PromptNode.tsx                     # 提示词节点
│   │   ├── GenerateNode.tsx                   # 生成任务节点
│   │   └── ImageNode.tsx                      # 图片节点
│   ├── panels/
│   │   ├── CanvasToolbar.tsx                  # 左侧工具栏（拖拽源）
│   │   ├── NodeInspector.tsx                  # 右侧属性面板（抽屉）
│   │   └── CanvasProjectBar.tsx              # 顶部项目栏（切换/新建/保存状态）
│   ├── hooks/
│   │   ├── useCanvasDnd.ts                    # 拖拽创建节点
│   │   ├── useCanvasGenerate.ts              # 触发生成
│   │   └── useCanvasAutosave.ts              # debounce 自动保存
│   ├── constants.ts                           # 节点类型 / 工具栏项 / 默认参数
│   └── types.ts                               # CanvasNodeData 联合类型
├── stores/canvas-store.ts                     # zustand（当前项目状态）
├── hooks/use-canvas.ts                        # react-query：CRUD + generate
└── routes/index.tsx                           # 新增 /canvas 路由
```

### 5.3 路由注册（`routes/index.tsx`）

在 `AppLayout` 子路由中新增：
```tsx
{ path: '/canvas', element: <CanvasPage /> }
```
保持 hash 路由兼容（`/#/canvas`）。

### 5.4 核心组件：`CanvasFlow.tsx`

```tsx
// 伪代码骨架
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
         useNodesState, useEdgesState, addEdge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const nodeTypes = {
  referenceImage: ReferenceImageNode,
  prompt: PromptNode,
  generate: GenerateNode,
  image: ImageNode,
}

function CanvasFlowInner() {
  const { nodes, edges, setNodes, setEdges, onConnect } = useCanvasStore()
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes)
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges)
  const { onDrop, onDragOver } = useCanvasDnd(setRfNodes)
  const wrapperRef = useRef(null)

  return (
    <div ref={wrapperRef} className="w-full h-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}

export default function CanvasFlow() {
  return (
    <ReactFlowProvider>
      <CanvasFlowInner />
    </ReactFlowProvider>
  )
}
```

### 5.5 拖拽创建节点（`useCanvasDnd.ts`，参考 React Flow 官方 DnD）

```tsx
// 工具栏项 draggable + onDragStart 设置 dataTransfer
// 画布 onDrop:
const onDrop = useCallback((event) => {
  event.preventDefault()
  const nodeType = event.dataTransfer.getData('application/reactflow')
  if (!nodeType) return
  const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
  const newNode = {
    id: `${nodeType}_${Date.now()}`,
    type: nodeType,
    position,
    data: defaultDataByType(nodeType),
  }
  setRfNodes((nds) => nds.concat(newNode))
}, [screenToFlowPosition, setRfNodes])
```

### 5.6 生成节点交互（`GenerateNode.tsx`）

- 显示状态徽章：idle / running（spinner）/ done / error
- 入边来自 `referenceImage` + `prompt` 节点
- "生成"按钮：
  1. 收集所有入边源节点 → 组装 `ReferenceInput[]` + prompt
  2. 调 `useCanvasGenerate(projectId, nodeId, payload)`
  3. 后端返回 `result_image_url` → 更新节点 `data.resultImageUrl` + `status='done'`
  4. 可选：自动派生 `image` 节点连出（便于继续迭代）
- done 状态：显示结果图缩略图，hover 显示"作为参考图""局部重绘""扩图"快捷操作（即梦式预测推荐）

### 5.7 参考图节点（`ReferenceImageNode.tsx`）

- 空状态：虚线框"拖入图片或点击上传"
- 有图：显示缩略图 + 顶部 refType 标签（content=蓝/style=紫/structure=绿/pose=橙）
- 点击切换 refType（快捷循环）
- Handle：右侧 source，可拖出连线到 generate 节点

### 5.8 状态管理（`canvas-store.ts`）

```ts
interface CanvasStore {
  projectId: string | null
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
  selectedNodeId: string | null
  dirty: boolean                    // 未保存标记

  // actions
  loadProject: (p: CanvasProject) => void
  setNodes / setEdges / onConnect / updateNodeData / addNode / removeNode
  setSelectedNode
  markDirty / markClean
}
// 持久化：sessionStorage（防刷新丢失）+ debounce 2s 同步后端
```

### 5.9 自动保存（`useCanvasAutosave.ts`）

```ts
// 监听 store.dirty 变化，debounce 2s 调 PUT /api/canvas/projects/{id}
// 顶部项目栏显示：已保存 / 保存中… / 未保存
```

### 5.10 顶部项目栏（`CanvasProjectBar.tsx`）

- 项目名（可编辑）
- 项目切换下拉（GET /api/canvas/projects）
- 新建按钮
- 保存状态指示
- 缩放重置 / 适应视图

### 5.11 右侧属性面板（`NodeInspector.tsx`）

选中节点时滑出抽屉（复用 shadcn `Sheet`）：
- referenceImage：refType 选择、替换图片、删除
- prompt：文本编辑（textarea）、negative prompt
- generate：参数（size/model/seed）、重绘强度（若 inpainting）、重新生成
- image：来源、父节点跳转、下载

---

## 六、实施步骤（建议顺序）

| # | 任务 | 文件 | 验证 |
|---|---|---|---|
| 1 | 后端：canvas 模块骨架 + Alembic 迁移 | `src/canvas/*`, `alembic/002_*` | `pytest` 通过 + `alembic upgrade head` 成功 |
| 2 | 后端：CRUD API + 上传接口 | `src/canvas/router.py` | curl/Postman 验证 CRUD |
| 3 | 后端：generate 编排（复用 image_generation） | `src/canvas/service.py` | 单元测试 / 手动触发 |
| 4 | 前端：安装 @xyflow/react + 路由 + 空画布页 | `package.json`, `routes/index.tsx`, `CanvasPage.tsx` | `/canvas` 显示空画布 + Controls |
| 5 | 前端：4 个自定义节点组件 | `components/canvas/nodes/*` | 节点能渲染、能选中 |
| 6 | 前端：左侧工具栏 + 拖拽创建 | `CanvasToolbar.tsx`, `useCanvasDnd.ts` | 拖入创建节点 |
| 7 | 前端：连线 + 生成节点触发生成 | `useCanvasGenerate.ts`, `GenerateNode.tsx` | 完整跑通一次生成 |
| 8 | 前端：zustand store + 自动保存 | `canvas-store.ts`, `useCanvasAutosave.ts` | 刷新后画布恢复 |
| 9 | 前端：右侧属性面板 | `NodeInspector.tsx` | 选中节点可编辑 |
| 10 | 前端：顶部项目栏 + 项目切换 | `CanvasProjectBar.tsx` | 多项目切换 |
| 11 | 样式打磨 + 响应式 | Tailwind 类 | 视觉对齐即梦风格 |
| 12 | 集成测试 + 文档 | `tests/test_canvas.py`, README | 端到端跑通 |

---

## 七、关键决策与假设

1. **画布库**：选 React Flow (`@xyflow/react`) 而非 `@infinit-canvas/react`。前者生态成熟、文档完善、500 节点内性能足够；后者作为未来升级选项（同 API）。
2. **混合形态实现**：连线"可选"——默认允许从参考图/提示词拖线到生成节点，但不强制；生成节点也可手动选择参考图（属性面板里勾选）。这样既支持即梦式自由摆放，也支持 Krea 式可追溯连线。
3. **多参考图降级策略**：doubao-seedream gateway 若不支持原生多图参考，先实现"content 主参考图 + style/structure 文字描述注入 prompt"，不阻塞前端流程；后续 gateway 升级再切原生多图。
4. **持久化策略**：nodes/edges 整体 JSON 存一列（而非拆表），简单可靠，符合 React Flow 序列化模型；查询性能在单用户百项目级别足够。
5. **不改动现有功能**：image-studio 与 workshop 完全保留，canvas 作为独立入口。后续若需统一，可把 workshop 的 9 步映射为画布节点模板。
6. **复用现有基础设施**：JWT auth、SQLAlchemy + Alembic、`lib/api.ts`、`auth-store`、`outputs/` 静态目录全部复用。
7. **上传存储**：参考图与生成结果统一存 `outputs/canvas/`，复用 `/outputs` 静态挂载。
8. **文件行数**：每个新文件控制在 500 行内（遵循 AGENTS.md 编码规范）。

---

## 八、验证步骤

### 后端
```bash
cd qinghe-video
pytest tests/test_canvas.py -v          # 新增：CRUD + generate 单元测试
alembic upgrade head                    # 迁移成功
uvicorn src.main:app --reload           # 启动后 Postman 验证 API
```

### 前端
```bash
cd qinghe-video/frontend
npm run lint                            # TS 无报错
npm run dev                             # 访问 /#/canvas
# 手动验证：
# 1. 从工具栏拖入 4 种节点
# 2. 上传参考图到 referenceImage 节点
# 3. 编辑 prompt 节点文本
# 4. 连线 referenceImage → generate, prompt → generate
# 5. 点击 generate 节点"生成"按钮 → 等待 → 显示结果图
# 6. 刷新页面 → 画布状态恢复（自动保存生效）
# 7. 新建/切换项目
```

### 端到端
- 完整跑通：上传参考图 → 写提示词 → 连线 → 生成 → 结果图显示 → 派生为新参考图 → 二次生成
- 多参考图：2+ referenceImage 节点连到同一 generate 节点，验证后端正确分组

---

## 九、未来演进（非本次范围）

- **局部重绘 / 扩图 / 抠图**：作为 generate 节点的子类型（inpaint/outpaint/cutout），复用同一节点框架
- **视频生成节点**：接入 `video_mvp.py`，画布上串联图→视频
- **节点模板库**：保存常用节点组合为模板（参考 Krea 社区模板）
- **实时协作**：WebSocket 同步多用户画布（参考 Freepik Spaces）
- **性能升级**：节点数 > 500 时切换 `@infinit-canvas/react`
- **与 workshop 统一**：workshop 9 步映射为画布节点模板，画布成为统一创作入口
