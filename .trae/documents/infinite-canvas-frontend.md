# 无限画布（Infinite Canvas）— 前端实施方案

## Summary

为清河视频创作平台新增一个独立的「无限画布」页面（`/#/canvas`），让用户像即梦 AI / 可灵 AI / Krea 那样，在一个自由画布上拖拽参考图、撰写提示词、连线到生成节点、一键出图，并以节点连线表达多参考图关系。

**后端已全部完成并验证通过**（`src/canvas/` 模块 + alembic 003 迁移 + `main.py` 路由注册 + `/canvas` SPA 路由）。本方案仅覆盖**前端实现**。

### 技术选型（已定）
- 画布库：`@xyflow/react@^12.11.1`（已装）—— 自定义节点 + Handle 连线 + `screenToFlowPosition` 拖拽落点
- 形态：**混合** = 自由画布为主 + 可选连线表达「参考图 / 提示词 → 生成」关系（用户已确认）
- 定位：**独立 `/canvas` 页面**，不改动 image-studio / workshop（用户已确认）
- 状态：`zustand`（画布本地态）+ `react-query`（API 态）
- 多参考图降级：后端 `generate_with_references` 已实现，content 主参考走图生图，style/structure 文字描述注入 prompt

## Current State Analysis（基于 Phase 1 探索）

### 后端 API（已完成，前端对接）
| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/canvas/projects` | POST | 创建项目 `{name, nodes[], edges[], viewport}` |
| `/api/canvas/projects` | GET | 列出当前用户项目（含 thumbnail_url/node_count） |
| `/api/canvas/projects/{id}` | GET | 取完整项目 |
| `/api/canvas/projects/{id}` | PUT | 更新（自动保存） |
| `/api/canvas/projects/{id}` | DELETE | 删除 |
| `/api/canvas/projects/{id}/generate` | POST | 触发生成 `{node_id, references[], prompt, negative_prompt?, params}` → `{node_id, status, result_image_url?, error?}` |
| `/api/canvas/upload` | POST | 上传参考图（multipart `file`）→ `{url, upload_id, filename, file_size}` |
| `/api/canvas/health` | GET | 健康检查 |

`references[]` 元素：`{image_url, ref_type}`，`ref_type ∈ {content, style, structure, pose}`（对标即梦四维参考图）。

### 前端既有模式（直接复用）
- `lib/api.ts`：`apiFetch`/`apiGet`/`apiPost` 自动注入 Bearer token，401 自动登出。FormData 不走 `json` 分支，原样传 `body`。
- `lib/constants.ts`：`STORAGE_KEYS` / `ROUTES` / `NAV_LINKS` 三组常量待扩展。
- `stores/workshop-store.ts`：zustand + `sessionStorage` 持久化模式（`persist` middleware 或手动订阅）。canvas-store 沿用同款。
- `hooks/use-media.ts`：`useMutation` + FormData 上传文件模式（手写 `fetch` + `getAuthToken()`，因为 `apiFetch` 对 FormData 会误加 JSON header——注意 `apiFetch` 已判断 `!(body instanceof FormData)` 跳过 stringify，但会保留 `Accept` header，上传可直接用 `apiFetch` 传 FormData）。
- `components/layout/AppLayout.tsx`：`Sidebar + Header + main(Outlet) + Footer`。CanvasPage 作为 `<Outlet>` 子元素，需自撑满 `main` 高度。
- shadcn UI 可用：`button, input, textarea, label, select, card, badge, skeleton, tabs, dialog`。
- `routes/index.tsx`：`createHashRouter`，children 数组追加一项即可。
- `lib/utils.ts`：`cn` / `truncate` / `formatDate` / `escapeHtml` 可用。

### 约束
- 单文件 ≤ 500 行（AGENTS.md 编码规范）。
- `AppLayout` 的 `main` 默认无固定高度，CanvasPage 需用 `h-[calc(100vh-...)]` 或 `flex-1 min-h-0` 撑满。需查 Header/Footer 高度后定值（实施时实测）。
- 路由用 hash 路由（`/#/canvas`）。

## Proposed Changes

### 文件清单（前端，共 ~16 个新文件 + 2 处改动）

```
frontend/src/
├── components/canvas/
│   ├── types.ts                        # 节点数据类型 + 常量（refType 选项等）
│   ├── CanvasFlow.tsx                  # ReactFlow 主画布（Controls/MiniMap/Background + nodeTypes 注册 + DnD 落点）
│   ├── nodes/
│   │   ├── ReferenceImageNode.tsx      # 参考图节点（上传/选择 ref_type/缩略图/右入边）
│   │   ├── PromptNode.tsx              # 提示词节点（正向 + 负向 textarea）
│   │   ├── GenerateNode.tsx            # 生成节点（size 选择 + 触发按钮 + 状态徽章 + 右出边）
│   │   └── ImageNode.tsx               # 结果图节点（展示生成图 + 下载）
│   ├── panels/
│   │   ├── CanvasProjectBar.tsx        # 顶部项目栏（新建/选择/重命名/保存状态指示/删除）
│   │   ├── CanvasToolbar.tsx           # 左侧工具栏（4 类节点拖拽源 + 上传按钮）
│   │   └── NodeInspector.tsx           # 右侧属性面板（按选中节点 kind 渲染编辑表单）
│   └── hooks/
│       ├── useCanvasDnd.ts             # 拖拽创建节点（onDragStart/onDrop + screenToFlowPosition）
│       ├── useCanvasGenerate.ts        # 收集入边 → 组装 GenerateRequest → 调 API → 回写结果图节点
│       └── useCanvasAutosave.ts        # 监听 dirty + debounce 2s → PUT /projects/{id}
├── stores/canvas-store.ts              # zustand：projectId/name/nodes/edges/viewport/selectedNodeId/dirty/saveStatus + actions
├── hooks/use-canvas.ts                 # react-query：7 个 hook（list/get/create/update/delete/generate/upload）
├── pages/CanvasPage.tsx                # 路由入口：ProjectBar + Toolbar + CanvasFlow + Inspector 三栏布局
├── lib/constants.ts                    # 【改】加 STORAGE_KEYS.canvas / ROUTES.canvas / NAV_LINKS 项
└── routes/index.tsx                    # 【改】注册 /canvas → CanvasPage
```

---

### 1. `components/canvas/types.ts`（新建）

定义节点数据联合类型与常量，与后端 `RefType`/`GenerateStatus` 对齐。

```ts
import type { Node, Edge, Viewport } from "@xyflow/react";

export type RefType = "content" | "style" | "structure" | "pose";
export type GenerateStatus = "idle" | "running" | "done" | "error";
export type CanvasNodeKind = "referenceImage" | "prompt" | "generate" | "image";

export interface ReferenceImageNodeData {
  kind: "referenceImage";
  imageUrl: string | null;
  refType: RefType;
  label: string; // 用户可改的备注名
  [key: string]: unknown; // 兼容 React Flow 加扩展字段
}
export interface PromptNodeData {
  kind: "prompt";
  prompt: string;
  negativePrompt: string;
  [key: string]: unknown;
}
export interface GenerateNodeData {
  kind: "generate";
  status: GenerateStatus;
  size: string;           // "1024x1024" | "1920x1920"
  error?: string;
  [key: string]: unknown;
}
export interface ImageNodeData {
  kind: "image";
  imageUrl: string | null;
  sourceGenerateNodeId?: string;
  [key: string]: unknown;
}
export type CanvasNodeData =
  | ReferenceImageNodeData
  | PromptNodeData
  | GenerateNodeData
  | ImageNodeData;

export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge;

export const REF_TYPE_OPTIONS: { value: RefType; label: string; color: string }[] = [
  { value: "content",   label: "内容", color: "#3b82f6" },
  { value: "style",     label: "风格", color: "#a855f7" },
  { value: "structure", label: "结构", color: "#f59e0b" },
  { value: "pose",      label: "姿态", color: "#ec4899" },
];

export const SIZE_OPTIONS = ["1024x1024", "1920x1920", "1024x1792", "1792x1024"];

/** 节点类型 → 工具栏拖拽项元信息。 */
export const TOOLBAR_ITEMS: { kind: CanvasNodeKind; label: string; emoji: string }[] = [
  { kind: "referenceImage", label: "参考图", emoji: "🖼️" },
  { kind: "prompt",         label: "提示词", emoji: "✍️" },
  { kind: "generate",       label: "生成",   emoji: "⚡" },
  { kind: "image",          label: "结果图", emoji: "📷" },
];

/** 连线合法性：仅允许 → generate；generate → image。 */
export function isValidConnection(src: string, tgt: string, srcKind: string, tgtKind: string): boolean {
  if (tgtKind === "generate" && (srcKind === "referenceImage" || srcKind === "prompt")) return true;
  if (tgtKind === "image" && srcKind === "generate") return true;
  return false;
}
```

---

### 2. `stores/canvas-store.ts`（新建）

zustand 管理画布本地态。**不持久化 nodes/edges**（太大，由服务端 GET 恢复），仅持久化 `projectId` + `name` 到 sessionStorage。

```ts
interface CanvasState {
  projectId: string | null;
  name: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: Viewport;
  selectedNodeId: string | null;
  dirty: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  loaded: boolean; // 项目数据是否已从服务端载入

  // actions
  loadProject: (p: { id: string; name: string; nodes: CanvasNode[]; edges: CanvasEdge[]; viewport: Viewport }) => void;
  newProject: (id: string, name: string) => void;   // 清空进入新项目
  setName: (name: string) => void;
  setNodes: (updater: CanvasNode[] | ((n: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (updater: CanvasEdge[] | ((e: CanvasEdge[]) => CanvasEdge[])) => void;
  setViewport: (v: Viewport) => void;
  addNode: (node: CanvasNode) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  removeNode: (id: string) => void;
  setSelected: (id: string | null) => void;
  markDirty: () => void;
  setSaveStatus: (s: CanvasState["saveStatus"]) => void;
  reset: () => void;
}
```

实现要点：
- 使用 `zustand` + 手动 `subscribe` 持久化 `projectId`/`name` 到 `sessionStorage[STORAGE_KEYS.canvas]`。
- `setNodes`/`setEdges` 接受 updater 函数或直接值（兼容 React Flow `onNodesChange` 的 `applyNodeChanges`）。
- 每个 mutating action 末尾调 `markDirty()`（`dirty=true, saveStatus='idle'`）。
- `loadProject` 设置 `loaded=true, dirty=false`。

---

### 3. `hooks/use-canvas.ts`（新建）

7 个 react-query hook，封装所有 `/api/canvas/*` 调用。

```ts
export function useCanvasProjects()            // GET /projects  → useQuery
export function useCanvasProject(id: string|null)  // GET /projects/{id} → useQuery(enabled: !!id)
export function useCreateCanvasProject()       // POST /projects → useMutation
export function useUpdateCanvasProject()       // PUT /projects/{id} → useMutation
export function useDeleteCanvasProject()       // DELETE /projects/{id} → useMutation
export function useCanvasGenerate()            // POST /projects/{id}/generate → useMutation
export function useCanvasUpload()              // POST /upload (FormData) → useMutation
```

- 用 `apiGet`/`apiPost`/`apiFetch`（PUT/DELETE 走 `apiFetch` 传 method）。
- `useCanvasUpload`：`apiFetch('/api/canvas/upload', { method:'POST', body: FormData, json:false })` —— `apiFetch` 已对 FormData 跳过 JSON.stringify，保留 `Accept` header 无害。
- generate mutation `onSuccess`：回调注入由 `useCanvasGenerate`（组件侧 hook）处理回写节点数据。

---

### 4. `components/canvas/nodes/*`（4 个新文件）

每个节点组件：
- 用 shadcn `Card`/`Badge`/`Button` 包裹，`Handle` 来自 `@xyflow/react`。
- 通过 `useStore`（React Flow 的 `useStoreApi` 或 zustand）读写节点数据。推荐：节点组件接收 `id` + `data`，用 `useCanvasStore` 的 `updateNodeData(id, patch)` 回写。

**ReferenceImageNode**：
- 顶部 ref_type `Select`（4 选项，带颜色点）；中部缩略图（`imageUrl` 存在则 `<img>`，否则占位 + 「上传」按钮）；`Handle type="source" position="right"`。
- 上传按钮触发隐藏 `<input type="file" accept="image/*">` → `useCanvasUpload` → `updateNodeData({imageUrl})`。

**PromptNode**：
- 两个 `Textarea`（正向 / 负向），受控；`Handle type="source" position="right"`。

**GenerateNode**：
- `Select` size + 「⚡ 生成」`Button` + 状态 `Badge`（idle/running/done/error，对应灰/蓝/绿/红）；左侧 `Handle type="target"`，右侧 `Handle type="source"`。
- 点击生成调 `useCanvasGenerate`（见 hooks/useCanvasGenerate.ts）。
- running 时禁用按钮 + 显示 spinner。

**ImageNode**：
- 展示 `imageUrl` 大图 + 下载链接；左侧 `Handle type="target"`；空态显示「等待生成」。

---

### 5. `components/canvas/CanvasFlow.tsx`（新建）

ReactFlow 主画布容器。

```tsx
const nodeTypes = { referenceImage: ReferenceImageNode, prompt: PromptNode, generate: GenerateNode, image: ImageNode };

export function CanvasFlow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setViewport } = useCanvasStoreSelectors();
  const { onDrop, onDragOver } = useCanvasDnd();
  const wrapperRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapperRef} className="h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes} edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onViewportChange={setViewport}
        isValidConnection={(c) => isValidConnection(...)}
        fitView
      >
        <Background /> <Controls /> <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
```

- `onNodesChange`/`onEdgesChange`/`onConnect` 在 store 中实现（用 `applyNodeChanges`/`applyEdgeChanges`/`addEdge`），调 `markDirty`。
- `useCanvasDnd` 见下。

---

### 6. `components/canvas/hooks/useCanvasDnd.ts`（新建）

拖拽创建节点。

```ts
export function useCanvasDnd() {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  // CanvasFlow 里 onInit={setReactFlowInstance}
  const onDragStart = (e, kind: CanvasNodeKind) => {
    e.dataTransfer.setData("application/reactflow", kind);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/reactflow") as CanvasNodeKind;
    if (!kind || !reactFlowInstance) return;
    const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const node = makeDefaultNode(kind, position);
    useCanvasStore.getState().addNode(node);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  return { onDragStart, onDrop, onDragOver, setReactFlowInstance };
}
```

`makeDefaultNode(kind, position)`：按 kind 生成默认 data + 唯一 id（`crypto.randomUUID()` 或 `nanoid`-like）。

> 注：`onDragStart` 由工具栏项调用；`onDrop`/`onDragOver`/`setReactFlowInstance` 由 CanvasFlow 绑定。`useCanvasDnd` 返回全部 4 个，CanvasFlow 与 Toolbar 各取所需。

---

### 7. `components/canvas/hooks/useCanvasGenerate.ts`（新建）

触发生成的编排逻辑（收集入边 → 组装请求 → 调 API → 回写）。

```ts
export function useCanvasGenerate() {
  const generate = useCanvasGenerateMutation(); // react-query
  return async (generateNodeId: string) => {
    const { nodes, edges, updateNodeData, addNode } = useCanvasStore.getState();
    const genNode = nodes.find(n => n.id === generateNodeId);
    if (!genNode) return;
    // 收集入边源节点
    const incoming = edges.filter(e => e.target === generateNodeId)
                          .map(e => nodes.find(n => n.id === e.source))
                          .filter(Boolean);
    const references = incoming.filter(n => n.data.kind === "referenceImage")
                               .map(n => ({ image_url: n.data.imageUrl, ref_type: n.data.refType }));
    const promptNodes = incoming.filter(n => n.data.kind === "prompt");
    const prompt = promptNodes.map(n => n.data.prompt).join("\n") || "（无提示词）";
    const negativePrompt = promptNodes.map(n => n.data.negativePrompt).filter(Boolean).join("\n") || undefined;
    updateNodeData(generateNodeId, { status: "running", error: undefined });
    try {
      const res = await generate.mutateAsync({ projectId, node_id: generateNodeId, references, prompt, negative_prompt: negativePrompt, params: { size: genNode.data.size } });
      if (res.status === "done" && res.result_image_url) {
        updateNodeData(generateNodeId, { status: "done" });
        // 创建/更新结果图节点，放在 generate 节点右侧
        addNode(makeImageNode(res.result_image_url, genNode.position, genNode.id));
        // 同时连一条 generate → image 的边
      } else {
        updateNodeData(generateNodeId, { status: "error", error: res.error ?? "生成失败" });
      }
    } catch (e) {
      updateNodeData(generateNodeId, { status: "error", error: String(e) });
    }
  };
}
```

---

### 8. `components/canvas/hooks/useCanvasAutosave.ts`（新建）

```ts
export function useCanvasAutosave() {
  const { dirty, projectId, nodes, edges, viewport, name, setSaveStatus } = useCanvasStore(...);
  const update = useUpdateCanvasProject();
  useEffect(() => {
    if (!projectId || !dirty) return;
    setSaveStatus("saving");
    const t = setTimeout(async () => {
      try {
        await update.mutateAsync({ id: projectId, body: { name, nodes, edges, viewport } });
        useCanvasStore.getState().markSaved(); // dirty=false, saveStatus="saved"
      } catch {
        setSaveStatus("error");
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [dirty, nodes, edges, viewport, name, projectId]);
}
```

> 在 `CanvasPage` 顶层调用一次即可。`markSaved` 是 store 新增 action（`dirty=false, saveStatus="saved"`）。

---

### 9. `components/canvas/panels/CanvasToolbar.tsx`（新建）

左侧工具栏（垂直），渲染 `TOOLBAR_ITEMS`，每项 `draggable` + `onDragStart`（调 `useCanvasDnd().onDragStart`）。顶部一个「上传参考图」按钮，点击直接创建一个 referenceImage 节点并触发其上传流程（或简单提示用户先拖出参考图节点再上传）。

---

### 10. `components/canvas/panels/CanvasProjectBar.tsx`（新建）

顶部栏：
- 左：项目名 `Input`（失焦/回车触发 `setName` + 保存）+ 保存状态徽章（saving/saved/error）
- 中：项目 `Select` 下拉切换（来自 `useCanvasProjects`）+ 「新建」按钮
- 右：「删除」按钮（带 confirm dialog）+ 健康检查指示（可选）

新建逻辑：`useCreateCanvasProject` → `mutateAsync({name:"未命名画布", nodes:[], edges:[], viewport:{x:0,y:0,zoom:1}})` → `loadProject(res)` → 路由切到 `/canvas`（已在则刷新画布）。

---

### 11. `components/canvas/panels/NodeInspector.tsx`（新建）

右侧属性面板，按 `selectedNodeId` 的 `kind` 渲染对应编辑表单：
- referenceImage：label Input + refType Select + imageUrl 展示 + 重新上传按钮
- prompt：正向/负向 Textarea（与节点内同步，本质调同一 `updateNodeData`）
- generate：size Select + 状态展示 + 「重置状态」按钮
- image：imageUrl + 下载链接 + 「在新窗口打开」

无选中时显示「选择一个节点以编辑属性」+ 项目统计（节点数/连线数）。

---

### 12. `pages/CanvasPage.tsx`（新建）

三栏布局：

```tsx
export function CanvasPage() {
  useCanvasAutosave();
  const { projectId, loaded } = useCanvasStore(...);
  const { data } = useCanvasProject(projectId);  // projectId 为 null 时不查
  useEffect(() => { if (data && !loaded) loadProject(data); }, [data]);

  if (!projectId) return <EmptyCanvasState onCreate={...} />; // 引导新建

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CanvasProjectBar />
      <div className="flex min-h-0 flex-1">
        <CanvasToolbar />       {/* w-16 左侧 */}
        <div className="min-w-0 flex-1"><CanvasFlow /></div>
        <NodeInspector />       {/* w-72 右侧 */}
      </div>
    </div>
  );
}
```

> 高度：`AppLayout` 的 `main` 是 `flex-1`，`CanvasPage` 根用 `h-full` + `min-h-0` 即可撑满。若 Header/Footer 占高度导致溢出，实施时调 `main` 或用 `h-[calc(100vh-header-footer)]`。先按 `h-full` 试，实测再修。

---

### 13. `lib/constants.ts`（改）

```ts
STORAGE_KEYS: { ..., canvas: "qinghe_canvas_session" }  // 加一项
ROUTES: { ..., canvas: "/canvas" }                      // 加一项
NAV_LINKS: 在合适位置插入 { to: ROUTES.canvas, label: "无限画布", route: ROUTES.canvas }
```

---

### 14. `routes/index.tsx`（改）

```tsx
import { CanvasPage } from "@/pages/CanvasPage";
// children 数组加：{ path: "canvas", element: <CanvasPage /> }
```

---

## 实施顺序（Todo）

| # | 任务 | 产出 | 验收 |
|---|---|---|---|
| 1 | `types.ts` + `constants.ts` 扩展 + `routes/index.tsx` 注册 + 空 `CanvasPage` | 4 处改动 | `/#/canvas` 可访问，显示空画布占位 |
| 2 | `canvas-store.ts` + `use-canvas.ts` | 2 文件 | TS 编译通过，store/actions 单测可手测 |
| 3 | 4 个节点组件 + `CanvasFlow.tsx`（含 Controls/MiniMap/Background） | 5 文件 | 空画布能渲染，手动 addNode 能显示节点 |
| 4 | `useCanvasDnd` + `CanvasToolbar` | 2 文件 | 从工具栏拖拽能在画布上创建节点 |
| 5 | 连线（store onConnect + isValidConnection） | 改 store | 能从参考图/提示词拉线到生成节点，非法连线被拒 |
| 6 | `useCanvasGenerate` + GenerateNode 按钮 | 2 文件 | 点击生成能调通后端，结果图节点出现 |
| 7 | `useCanvasAutosave` + `CanvasProjectBar` | 2 文件 | 新建/切换/重命名/删除项目可用，2s 后自动保存 |
| 8 | `NodeInspector` + 上传参考图闭环 | 2 文件 | 选中节点可编辑，上传参考图能落盘显示 |
| 9 | `npm run build`（tsc + vite）通过 + 浏览器实测拖拽/连线/生成/保存全链路 | — | 全功能可用，无 TS 报错 |

## Assumptions & Decisions

1. **不持久化 nodes/edges 到 sessionStorage**：数据量可能大，统一由服务端 GET 恢复；sessionStorage 只存 `projectId`/`name` 供刷新后回到同一项目。
2. **结果图节点自动生成**：生成成功后在 generate 节点右侧自动 addNode 一个 image 节点并连边，无需用户手动拖。
3. **多结果图**：当前后端 `generate_with_references` 返回单图（n=1），每次生成创建一个新 image 节点（不覆盖旧图，便于对比迭代）。
4. **上传走节点内触发**：参考图上传在 ReferenceImageNode 内点「上传」完成，不在工具栏单独上传（工具栏上传按钮 = 创建空参考图节点 + 自动打开其上传）。
5. **id 生成**：用 `crypto.randomUUID()`（现代浏览器原生支持，无需额外依赖）。
6. **自动保存防抖 2s**：与后端 router 注释 `debounce 2s` 对齐。
7. **空项目引导**：无 projectId 时显示居中「新建画布」按钮，不自动创建（避免误产生空项目）。
8. **错误处理**：生成失败在 GenerateNode 显示红色 Badge + error 文案；自动保存失败显示 error 徽章但不阻断操作。
9. **不改 AppLayout / Header / Footer**：CanvasPage 自适应 `main` 高度。若高度不足，优先调 CanvasPage 根容器的 flex，不动布局壳。
10. **shadcn 组件复用**：节点边框用 `Card`，状态用 `Badge variant`，下拉用 `Select`，输入用 `Input`/`Textarea`，按钮用 `Button size="sm"`。

## Verification

1. **编译**：`cd qinghe-video/frontend && npm run build`（`tsc -b && vite build`）零报错。
2. **Lint**：`npm run lint` 无新增 error。
3. **端到端手测**（`npm run dev` + 后端 `uvicorn`）：
   - 访问 `/#/canvas` → 看到空状态 → 点「新建画布」→ 项目出现在顶部下拉。
   - 从左侧工具栏拖「参考图」到画布 → 节点出现 → 点节点内上传 → 选图 → 缩略图显示。
   - 拖「提示词」节点 → 输入文本。
   - 拖「生成」节点 → 从参考图/提示词拉线到生成节点（连线成功）→ 从生成节点拉线到结果图节点（被拒，因为 image 只接受 generate→image 由生成自动创建，手动也允许？按 isValidConnection，generate→image 合法，允许手动连但不必要）。
   - 点生成节点「⚡ 生成」→ running → done → 右侧自动出现结果图节点含生成图。
   - 2s 后顶部保存状态变「已保存」；刷新页面 → 项目恢复。
   - 切换项目 → 画布切换；删除项目 → 确认后删除。
4. **后端契约校验**：generate 请求体 `{node_id, references:[{image_url,ref_type}], prompt, negative_prompt?, params:{size}}` 与后端 `GenerateRequest` 完全一致；upload 响应 `{url, upload_id, filename, file_size}` 与 `UploadResponse` 一致。

---

## 实施进度与剩余修复（续）

### 已完成（步骤 1-8 主体）
16 个前端文件已创建 + 2 处改动已落地：
- `components/canvas/{types,nodeFactory}.ts`
- `stores/canvas-store.ts`
- `hooks/use-canvas.ts`
- `components/canvas/nodes/{ReferenceImageNode,PromptNode,GenerateNode,ImageNode}.tsx`
- `components/canvas/hooks/{useCanvasDnd,useCanvasGenerate,useCanvasAutosave}.ts`
- `components/canvas/CanvasFlow.tsx`
- `components/canvas/panels/{CanvasToolbar,CanvasProjectBar,NodeInspector}.tsx`
- `pages/CanvasPage.tsx`
- `lib/constants.ts`（改）、`routes/index.tsx`（改）

### 剩余修复（步骤 9 收尾，2 个 TS 编译错误）

运行 `npx tsc -b --pretty false` 后仅剩 2 个错误：

**错误 1** — `components/canvas/CanvasFlow.tsx(79,9)` onInit 类型不匹配
- 现状：`CanvasFlowProps.onInit: (instance: ReactFlowInstance) => void`（默认泛型 `<Node, Edge>`）
- RF 因 `nodes={nodes}`（`CanvasNode[]`）推断 `onInit` 期望 `ReactFlowInstance<CanvasNode, Edge>`
- 修复：将 `CanvasFlowProps.onInit` 改为 `(instance: ReactFlowInstance<CanvasNode, Edge>) => void`，并 import `CanvasNode` 类型；同步将 `useCanvasDnd.ts` 的 `useState<ReactFlowInstance | null>` 改为 `useState<ReactFlowInstance<CanvasNode, Edge> | null>`

**错误 2** — `components/canvas/panels/NodeInspector.tsx(151,18)` `Cannot find name 'CanvasNodeData'`
- 现状：import 块（行 23-31）只有 `GenerateNodeData/ImageNodeData/PromptNodeData/ReferenceImageNodeData`，缺 `CanvasNodeData`
- 但 `UpdateFn` 类型（行 149-152）用了 `Partial<CanvasNodeData>`
- 修复：在 import 块中加入 `type CanvasNodeData`

### 收尾验证
1. `npx tsc -b --pretty false` → 零错误
2. `npm run build`（tsc -b && vite build）→ 成功产出 dist/
3. `npm run lint` → 无新增 error
4. 浏览器手测（可选，需后端运行）：访问 `/#/canvas` 全链路

### 修复后即完成整个 plan，不新增任何功能。
