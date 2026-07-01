# 独立节点画布故事板（Plan A）+ 背景恢复

## 概要 / Summary

将无限画布故事板改造为 ComfyUI / 即梦画布风格：**素材图、系统提示词、故事板文本作为独立可拖拽节点**，通过**连线（edges）**汇入"片段生成器节点"，节点内部不再内嵌文本框与素材槽。

同时**恢复画布之前的暖色浅底主题**，撤销上一版"电影预演工作台 / Editorial Cinema Lab"深色实验室主题。

用户已选择 **Plan A**：PromptNode 通过 `role` 字段（`system` / `storyboard` / `generic`）区分类型；片段节点保留**单 target Handle**，由 `collectSegmentInputs` 按源节点 `kind + role` 自动分类。

---

## 当前进度（Phase 1 探索结论）

经代码验证，前序会话已完成的工作（**保持不动**）：

| 任务 | 文件 | 状态 |
|---|---|---|
| #8 | `types.ts` — `PromptRole` 类型、`PromptNodeData.role?` 字段、TOOLBAR_ITEMS 增加"故事板文本/系统提示词"两个 preset 项 | ✅ 已完成 |
| #8 | `nodeFactory.ts` — `makePromptNode(role, prompt, pos, label?)`、`makeReferenceImageNode(url, pos, label?)`、`makeDefaultNode(kind, pos, preset?)` 合并 preset | ✅ 已完成 |
| #9 | `useCanvasDnd.ts` — `onDragStart(e, kind, preset?)` 写入第二 MIME `application/reactflow-preset`；`onDrop` 读回并合并 | ✅ 已完成 |
| #9 | `CanvasToolbar.tsx` — `key={item.label}`（避免 3 个 prompt 项 key 冲突）、`onDragStart(e, item.kind, item.preset)` | ✅ 已完成 |
| #10 | `useCanvasStoryboard.ts` — `collectSegmentInputs` 纯函数、`SegmentInputs` 接口、`useSegmentInputs(nodeId)` hook；`segmentNodeToInput(node, inputs)` 接受 inputs 参数并回退到内嵌字段；`generateSegment` / `generateAllSegments` 走边收集 + 内嵌字段回退 | ✅ 已完成 |

**已验证的关键基础设施**：
- `types.ts` 的 `isValidConnection` 已允许 `referenceImage` / `prompt` → `segment`（types.ts:244-249）
- `canvas-store.ts` 暴露 `addNodes` / `setEdges`（接受 updater）/ `addEdgeRaw(edge)` / `updateNodeData` / `onConnect` / `storyboardAssets` / `systemPrompt`
- `makePromptNode` / `makeReferenceImageNode` 工厂已存在但**目前未被任何代码调用**（将在 Task #12 首次使用）

---

## 剩余工作 / Proposed Changes

### Task #11 — 节点组件改造（3 个文件）

#### 文件 1：`qinghe-video/frontend/src/components/canvas/nodes/PromptNode.tsx`

**当前**：Card 基底 ✓，但 header 只显示 `✍️ 提示词`，没有 role 标识。

**改造**：
1. 在文件顶部新增 `ROLE_META` 常量映射：
   ```typescript
   const ROLE_META: Record<NonNullable<PromptNodeData["role"]>, { label: string; emoji: string }> = {
     system: { label: "系统提示词", emoji: "⚙️" },
     storyboard: { label: "故事板文本", emoji: "📜" },
     generic: { label: "提示词", emoji: "✍️" },
   };
   ```
2. 在 `CardHeader` 区域读取 `d.role ?? "generic"`，显示对应的 emoji + label（替代硬编码 `✍️ 提示词`）。
3. 右侧 source Handle 保留（已存在）。
4. 文本域仍绑定 `d.prompt`，无逻辑变化。

**Why**：用户拖入"故事板文本/系统提示词"工具栏项后，节点视觉上需要立刻反映角色，否则 3 个同类节点难以区分。

#### 文件 2：`qinghe-video/frontend/src/components/canvas/nodes/StoryboardSegmentNode.tsx`

**当前**：混合状态 —— 左侧 target Handle ✓（已存在），但节点体内仍内嵌 `storyboardText` / `systemPrompt` 两个 Textarea，且仍有 `ASSET_SLOTS`（character/object/scene）显示 `store.storyboardAssets`。未调用 `useSegmentInputs`。

**改造为"生成器节点"**：
1. 删除 `storyboardText` Textarea、`systemPrompt` Textarea、`ASSET_SLOTS` 渲染块。
2. 新增 `import { useSegmentInputs } from "../hooks/useCanvasStoryboard"`，调用 `const inputs = useSegmentInputs(id)`。
3. 在节点体内显示**入边就绪状态**面板（替代原文本框）：
   ```
   ┌─ 入边状态 ─────────────┐
   │ ✅ 故事板文本  (或 ⚠ 未连接) │
   │ ✅ 系统提示词  (或 ⚠ 未连接) │
   │ ✅ 3 张参考图  (或 ⚠ 未连接) │
   └────────────────────────┘
   ```
   - `inputs.hasStoryboard` → ✅/⚠
   - `inputs.hasSystem` → ✅/⚠
   - `inputs.contentRefs.length` → 数字或 0
4. 保留：标题、左 target Handle、右 source Handle、结果图区、`生成` 按钮（调用 `generateSegment(id)`）、`生成中` loading、错误展示。
5. 删除对 `store.storyboardAssets` 的直接读取（参考图改由边汇入）。

**Why**：节点作为"生成器"语义清晰，用户通过连线而非内嵌表单提供输入，符合 ComfyUI 范式。`collectSegmentInputs` 已支持回退到内嵌字段，删除 UI 上的内嵌字段不会破坏**已有项目**的生成能力（仅 UI 不再展示这些字段；如旧项目想编辑需连线或改在 NodeInspector）。**注意**：旧 SegmentNode 数据里仍有 `storyboardText` / `systemPrompt` 字段，TS 类型保留可选字段即可，不强制清理数据。

**回退策略**（向后兼容）：
- `SegmentNodeData` 类型定义里 `storyboardText?` / `systemPrompt?` 仍保留为可选字段
- 生成逻辑 `inputs.storyboardText || d.storyboardText` 不变
- 旧项目打开后：节点显示"未连接"，但点"生成"仍能成功（走内嵌字段回退）

#### 文件 3：`qinghe-video/frontend/src/components/canvas/panels/NodeInspector.tsx`

**当前**：`PromptEditor`（约 248-272 行）只有 Textarea 绑定 `data.prompt`，没有 role 选择器。

**改造**：在 `PromptEditor` 的 `<CardContent>` 顶部插入一个 role Select：
```tsx
<div className="space-y-1">
  <label className="text-[11px] font-medium text-muted-foreground">角色</label>
  <Select
    value={data.role ?? "generic"}
    onValueChange={(v) => updateNodeData(id, { role: v as PromptRole })}
  >
    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="generic">✍️ 通用提示词</SelectItem>
      <SelectItem value="storyboard">📜 故事板文本</SelectItem>
      <SelectItem value="system">⚙️ 系统提示词</SelectItem>
    </SelectContent>
  </Select>
</div>
```

需要新增 import：`PromptRole` from `@/components/canvas/types`。

**Why**：用户在画布上把 prompt 节点拖出来后，应能在右侧属性面板修改其角色（无需删除重拖）。

---

### Task #12 — 导出流程改造（1 个文件 + 1 个 hook）

#### 文件 4：`qinghe-video/frontend/src/components/canvas/hooks/useCanvasStoryboard.ts` 中的 `loadFromWorkshop`

**当前**（约 190-247 行）：调用 `makeSegmentNodes(segs, layout, store.systemPrompt)` 创建段节点，把 `systemPrompt` 内嵌到每个段节点的 data 里。`makePromptNode` / `makeReferenceImageNode` 工厂未被使用。

**改造为"独立节点 + 边"布局**：

1. 保留段节点创建，但**不再内嵌 systemPrompt**（`storyboardText` 字段也设为空字符串，因为将通过边汇入）。段节点的标题、序号、resultImageUrl 等仍保留。
2. 在所有段节点的**上方**创建一个共享的"系统提示词" PromptNode：
   ```typescript
   const sysPromptNode = makePromptNode(
     "system",
     store.systemPrompt,
     { x: -400, y: -100 },
     "系统提示词"
   );
   ```
3. 为**每个段**创建一个"故事板文本" PromptNode（位于段左侧）：
   ```typescript
   const storyNode = makePromptNode(
     "storyboard",
     seg.storyboard_text,
     { x: seg.x - 400, y: seg.y },
     `故事板 · 段${seg.segment_id}`
   );
   ```
4. 若 `store.storyboardAssets` 有图，为每张图创建一个 ReferenceImageNode（位于段左侧上方）：
   ```typescript
   const refNodes = assets
     .filter(a => a.url)
     .map((a, i) => makeReferenceImageNode(a.url!, { x: -600, y: -300 + i * 140 }, a.label ?? "参考图"));
   ```
5. 创建**边**：每个 PromptNode / ReferenceImageNode → 对应段节点。使用 `addEdgeRaw` 或直接构造 edge 对象数组，一次性 `setEdges([...])`：
   ```typescript
   const edges = [
     { id: `e-sys-${segId}`, source: sysPromptNode.id, target: segId, sourceHandle: null, targetHandle: null },
     { id: `e-story-${segId}`, source: storyNode.id, target: segId, ... },
     ...refNodes.map(rn => ({ id: `e-ref-${rn.id}-${segId}`, source: rn.id, target: segId, ... })),
   ];
   ```
6. 一次性 `addNodes([...sysPromptNode, ...storyNodes, ...refNodes, ...segmentNodes])` + `setEdges((prev) => [...prev, ...edges])`。

**Why**：导出后用户立即看到完整的 ComfyUI 风格连线图，而不是孤立的段节点 + 内嵌文本。这是本方案的核心交付物。

**布局参数**（建议）：
- 段节点：行间距 460（沿用 `makeSegmentNodes` 现有布局）
- 系统提示词节点：所有段共享一个，位于第一段左上方 `(-400, -100)`
- 故事板节点：每段一个，位于段左侧 `(-400, segY)`
- 参考图节点：垂直堆叠在画布左上角 `(-600, -300 + i*140)`

---

### Task #13 — 背景恢复（4 个文件 + 1 个删除）

用户明确要求："画布颜色背景恢复之前的背景颜色"。撤销深色 Cinema Lab 主题，回到之前的暖色浅底 React Flow 默认风格。

#### 文件 5（删除）：`qinghe-video/frontend/src/components/canvas/canvas.css`

直接 `DeleteFile`。该 188 行文件定义了 `.canvas-lab`、`.canvas-node-frame`、`.canvas-status-bar`、`.canvas-node-reveal`、`.canvas-panel`、`.canvas-panel-title`、`.font-tech`、`.font-display` 等深色主题类，全部移除。

**Why**：恢复主题最干净的方式是删除整个文件，让所有 `canvas-*` class 自然失效（Tailwind 不会报错，只是无样式）。

#### 文件 6：`qinghe-video/frontend/src/pages/CanvasPage.tsx`

1. 删除 `import "@/components/canvas/canvas.css";`（line 42）
2. 三个根 div 的 `className` 从 `"canvas-lab flex h-full min-h-0 flex-col"` 改为 `"flex h-full min-h-0 flex-col"`（移除 `canvas-lab`，约 line 101 / 131 / 141）

**Why**：根除深色主题入口。

#### 文件 7：`qinghe-video/frontend/src/components/canvas/CanvasFlow.tsx`

1. `<Background gap={24} size={1} color="rgba(232,163,61,0.10)" />` → `<Background gap={24} size={1} color="rgba(0,0,0,0.06)" />`（line 96）
2. `isValidConnection` 逻辑**保持不变**（已正确）。

**Why**：`rgba(0,0,0,0.06)` 是上一版浅底画布的点阵颜色（React Flow 默认浅灰点）。

#### 文件 8：`qinghe-video/frontend/src/components/canvas/nodes/ShotNode.tsx`

1. 根元素从 `<div className="canvas-node-frame canvas-node-reveal w-64" style={{ '--reveal-index': ... }}>` 改回 `<Card className="w-64">`（vanilla shadcn Card）。
2. 删除 `canvas-status-bar` div（line 46），改用 Card 内的 Badge 显示状态。
3. 移除 staggered reveal 的 `--reveal-index` 内联样式。
4. 保留 SHOT 徽章、Film 图标、缩略图、操作按钮等业务元素。
5. 移除未使用的 import（如 `cn` 若不再需要）。

**Why**：恢复与其他节点一致的 Card 视觉。

#### 文件 9：`qinghe-video/frontend/src/components/canvas/panels/StoryboardSidebar.tsx`

1. 四个 section Card 的 `className="canvas-panel"` → 删除该 class（保留 `Card` 本身）。
2. CardTitle 的 `className="canvas-panel-title ..."` → 移除 `canvas-panel-title`，保留其余 Tailwind class。
3. 移除未使用的 lucide import（如 `Settings2` 仍可保留作为图标）。
4. **不改动业务逻辑**（仍走 `useCanvasStoryboard` 的批量生成 / 合成流程）。

**Why**：侧边栏跟随浅色主题，但功能不动。

---

### Task #14 — 验证

1. **前端类型检查**：
   ```powershell
   cd qinghe-video/frontend
   npx tsc --noEmit
   ```
   预期：0 errors。重点关注：
   - `StoryboardSegmentNode.tsx` 删除内嵌字段后是否有未使用 import
   - `useExportStoryboardToCanvas` 改造后类型对齐
   - `NodeInspector.tsx` 新增 `PromptRole` import 是否使用

2. **前端 Lint**（已知有预存在的 ESLint 配置问题，仅确认本次改动不引入新 error）：
   ```powershell
   cd qinghe-video/frontend
   npm run lint
   ```

3. **后端测试**（本次未改后端，但跑一遍防回归）：
   ```powershell
   cd qinghe-video
   pytest tests/ -v
   ```
   预期：113 passed（含上一会话新增的 21 个 test_canvas_segment.py）。

4. **手动验证**（可选，由用户执行）：
   - 启动 `run.ps1`
   - 进入画布 → 故事板模式
   - 从工具栏拖入"故事板文本""系统提示词"两个 prompt 节点 → header 显示对应 emoji + label
   - 拖入一个参考图节点 → 上传图片
   - 拖入一个 segment 节点 → 显示入边状态面板（全 ⚠ 未连接）
   - 连线：prompt → segment、referenceImage → segment → 状态变 ✅
   - 点击生成 → 走 `collectSegmentInputs` 成功
   - 从工坊导出故事板 → 自动生成独立节点 + 边
   - 画布背景为浅灰点阵（非深色）

---

## 假设与决策 / Assumptions & Decisions

1. **保留 Plan A 已完成的基础设施**（types / nodeFactory / useCanvasDnd / CanvasToolbar / useCanvasStoryboard 边收集核心）—— 不重写。
2. **旧项目兼容**：`SegmentNodeData.storyboardText?` / `systemPrompt?` 保留为可选字段；`collectSegmentInputs` 已有内嵌字段回退，旧段节点即使没边也能生成。仅 UI 上不再展示内嵌文本框。
3. **`loadFromWorkshop` 布局**：系统提示词节点为所有段共享一个（位于第一段左上）；故事板节点每段一个；参考图节点垂直堆叠左上。具体坐标见 Task #12。
4. **背景恢复范围**：删除整个 `canvas.css`、移除 `.canvas-lab` wrapper、`ShotNode` / `StoryboardSidebar` 跟随回退到 vanilla Card；`Background` color 改回 `rgba(0,0,0,0.06)`。`isValidConnection` 不动。
5. **PromptNode 不需要左侧 target Handle**（它只作为 source 输出给 segment）；保留右侧 source Handle 即可。
6. **不引入新依赖**：全部用现有 shadcn 组件（Card / Badge / Select / Textarea / Button）。
7. **StorySegment → segment node 的 `storyboard_text` 仍写入 data**（虽然 UI 不显示，但作为回退数据保留）。

---

## 文件改动清单

| # | 文件 | 操作 | 任务 |
|---|---|---|---|
| 1 | `nodes/PromptNode.tsx` | 改：加 role 徽章 | #11 |
| 2 | `nodes/StoryboardSegmentNode.tsx` | 重写：生成器节点 + 入边状态面板 | #11 |
| 3 | `panels/NodeInspector.tsx` | 改：PromptEditor 加 role Select | #11 |
| 4 | `hooks/useCanvasStoryboard.ts` | 改：`loadFromWorkshop` 创建独立节点 + 边 | #12 |
| 5 | `canvas.css` | **删除** | #13 |
| 6 | `pages/CanvasPage.tsx` | 改：删 import + 移除 `canvas-lab` class | #13 |
| 7 | `CanvasFlow.tsx` | 改：Background color → `rgba(0,0,0,0.06)` | #13 |
| 8 | `nodes/ShotNode.tsx` | 改：div → Card，移除 `canvas-node-frame` | #13 |
| 9 | `panels/StoryboardSidebar.tsx` | 改：移除 `canvas-panel` / `canvas-panel-title` class | #13 |

全部为前端改动；后端零改动。

---

## 执行顺序建议

1. Task #13（背景恢复）先做 —— 删 css + 改 CanvasPage + CanvasFlow + ShotNode + StoryboardSidebar，建立干净浅色基底。
2. Task #11（节点组件）—— 在浅色基底上重写 PromptNode / StoryboardSegmentNode / NodeInspector。
3. Task #12（导出流程）—— 最后接通"工坊 → 画布"独立节点 + 边。
4. Task #14（验证）—— tsc + pytest + 手动。
