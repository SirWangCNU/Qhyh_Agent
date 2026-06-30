# 分步工坊 × 无限画布故事板集成计划

## 1. 摘要（Summary）

在现有 `/canvas` 无限画布基础上扩展「故事板模式（Storyboard Mode）」。用户在分步工坊完成 **人物 / 物品 / 场景一致性生图** 与 **脚本 / 视觉** 步骤后，可一键将分镜、参考图、旁白导入画布；在无限画布上以分镜节点（Shot Node）阵列的方式拖拽调整、替换参考图、修改提示词，并批量生成分镜图，最终合成视频。

整体定位：**工坊负责「结构化输入与自动编排」，画布负责「可视化的分镜二次创作」**，两者通过「导入 + 自动布局」衔接，而不是在工坊里内嵌一个简化画布。

## 2. 现状分析（Current State Analysis）

### 2.1 已有基础设施

| 模块 | 关键文件 | 现状 |
|------|---------|------|
| 工坊页面 | `frontend/src/pages/WorkshopPage.tsx` | 9 步流水线，第 3 步生成一致性参考图，第 4/5 步产出 `shots` 与 `shot_prompts`，第 7 步出图、第 8 步 TTS、第 9 步合成 |
| 一致性图 | `frontend/src/components/workshop/ConsistencyImagesPanel.tsx` | 人物/物品/场景三张卡片，结果写入 `workshopStore.mediaResults.{characterImage,objectImage,sceneImage}` |
| 无限画布 | `frontend/src/pages/CanvasPage.tsx` | 独立全屏页面，基于 React Flow |
| 画布节点 | `frontend/src/components/canvas/types.ts` | 4 种节点：`referenceImage / prompt / generate / image` |
| 画布生成 | `frontend/src/components/canvas/hooks/useCanvasGenerate.ts` | 单生成节点触发，入边收集参考图与提示词，调用 `POST /api/canvas/projects/{id}/generate` |
| 后端生成 | `src/canvas/router.py` / `service.py` | `run_generate` 单张生成，调用 `image_generation.generate_with_references` |
| 状态管理 | `frontend/src/stores/canvas-store.ts` | zustand，持久化 `projectId + name`，nodes/edges 从服务端恢复 |

### 2.2 当前缺失

1. 没有「分镜 / Shot」节点类型，无法表达「镜号 + 画面描述 + 旁白 + 时长 + 参考图」。
2. 工坊与画布数据不互通：脚本/视觉输出、一致性图无法自动流入画布。
3. 画布只支持单生成节点触发，没有按 shot 批量生成并自动排列的能力。
4. 没有故事板专用侧边栏（素材库 / 时间轴 / 批量操作）。
5. 没有从画布回打工坊或触发视频合成的闭环。

## 3. 主流做法调研（Market Research Summary）

基于公开资料整理，当前主流 AI 创作工具的故事板/无限画布模式有以下共性：

1. **节点即素材，连线即工作流**（如 ComfyUI、即梦画布、可灵）：参考图、提示词、生成节点、结果图通过边连接，用户可自由组装。
2. **时间轴 + 自由画布双视图**（如 Runway、Lovable、Magic Patterns）：底部/侧边有时间轴缩略图，上方是无限画布；分镜顺序在时间轴体现，细节在画布调整。
3. **自动布局 + 手动微调**（如 tldraw、FigJam）：AI 先生成骨架，用户再拖拽、缩放、替换素材。
4. **参考图库常驻侧边栏**（如 Midjourney 风格参考、即梦四维参考）：人物/物品/场景图以缩略图形式拖入节点，保证主体一致性。
5. **批量生成与一键合成**（如 Kling、Runway）：选中多个分镜节点后批量出图，再一键拼接成视频。

本次方案选择：**在现有 React Flow 画布上新增「Shot 节点 + 故事板模式 + 侧边素材库」，优先复用而非引入 tldraw 等第三方画布引擎**，以降低迁移成本和数据库兼容风险。

## 4. 方案设计（Proposed Changes）

### 4.1 整体数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│  分步工坊 Workshop                                                   │
│  Step3 一致性图 ──┐                                                  │
│  Step4 脚本      ├──→  导出 storyboard payload  ──→  /canvas 路由    │
│  Step5 视觉      ──┘   {shots, refs, voiceover}                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  无限画布 /canvas（故事板模式）                                       │
│  1. 自动创建 ShotNode 阵列（一行一个分镜）                             │
│  2. 左侧素材库：人物/物品/场景参考图、旁白文案                          │
│  3. 用户拖拽参考图到 ShotNode、编辑 prompt/旁白/时长                   │
│  4. 批量生成：每个 ShotNode → GenerateNode → ImageNode                 │
│  5. 一键合成：所有 ImageNode + 旁白 → /api/video/compose              │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 前端改动

#### 4.2.1 类型与节点工厂

**文件**: `frontend/src/components/canvas/types.ts`

- 新增 `CanvasNodeKind = "shot"`。
- 新增 `StoryboardMode = "free" | "storyboard"`。
- 新增 `ShotNodeData`：
  ```ts
  interface ShotNodeData {
    kind: "shot";
    shotId: string;          // 来自 scriptwriter 的 shot id
    title: string;           // 镜号标题，如 "分镜 1"
    visualPrompt: string;    // 画面描述 / 提示词
    narration: string;       // 旁白
    duration: number;        // 时长（秒）
    referenceImageUrl?: string; // 当前 shot 绑定的参考图
    referenceType?: "character" | "object" | "scene";
    status: "idle" | "running" | "done" | "error";
    resultImageUrl?: string;
    error?: string;
  }
  ```
- 扩展 `isValidConnection`：允许 `referenceImage / prompt → shot`；允许 `shot → generate`；保留原有 `generate → image`。
- `TOOLBAR_ITEMS` 增加 `{ kind: "shot", label: "分镜", emoji: "🎬" }`。
- `GENERATE_STATUS_META` 可复用给 shot 状态。

**文件**: `frontend/src/components/canvas/nodeFactory.ts`

- `defaultNodeData` 增加 `shot` 分支。
- 新增 `makeShotNode(shot, position)`：从工坊 shot 数据创建 ShotNode。
- 新增 `layoutStoryboardShots(shots, startPosition)`：按纵向或横向网格排列分镜节点，默认纵向瀑布流（间距 320×240），避免重叠。
- 新增 `makeGenerateNodeForShot(shotNode)`：在 shot 节点右侧自动生成一个关联的 `generate` 节点，并创建 `shot → generate` 的边。

#### 4.2.2 Shot 节点组件

**文件**: `frontend/src/components/canvas/nodes/ShotNode.tsx`

UI 包含：
- 顶部：镜号标题 + 状态徽章（idle/running/done/error）。
- 中部：画面描述文本框（可编辑 `visualPrompt`）。
- 下部：旁白文本框、时长数字输入。
- 右侧/底部：缩略图占位，显示当前绑定的参考图或结果图。
- 操作按钮：「生成此镜」、「替换参考图」、「删除分镜」。

样式使用现有 shadcn 卡片风格，宽度固定 260px，高度自适应。

#### 4.2.3 故事板侧边栏

**文件**: `frontend/src/components/canvas/panels/StoryboardSidebar.tsx`

在画布右侧 `NodeInspector` 旁边或替代 `NodeInspector`（故事板模式下）显示：
- **素材库**：从 `canvas-store.storyboardAssets` 读取人物/物品/场景参考图，可拖拽到 shot 节点。
- **旁白**：显示完整旁白文本，可一键同步到所有 shot 的 `narration`。
- **批量操作**：
  - 「批量生成分镜图」：对所有未生成或状态为 error 的 shot 串行/并发生成。
  - 「一键合成视频」：收集所有 shot 的结果图 + 拼接旁白 → TTS → 视频合成。
- **视图切换**：自由模式 / 故事板模式。

#### 4.2.4 工具栏与画布入口

**文件**: `frontend/src/components/canvas/panels/CanvasToolbar.tsx`

- 增加 `shot` 拖拽项。
- 增加模式切换按钮（仅在从工坊导入时显示为 storyboard 模式）。

**文件**: `frontend/src/components/canvas/CanvasFlow.tsx`

- `nodeTypes` 增加 `shot: ShotNode`。
- `MiniMap` 的 `nodeColor` 增加 shot 分支颜色（如 `#f97316`）。

#### 4.2.5 故事板专用 Hook

**文件**: `frontend/src/components/canvas/hooks/useCanvasStoryboard.ts`

职责：
- `loadFromWorkshop(projectId, payload)`：创建或更新画布项目，写入 shot 节点、参考图节点、默认布局。
- `generateShot(shotNodeId)`：为单个 shot 创建 generate 节点并触发 `useCanvasGenerate`。
- `generateAllShots()`：遍历所有 shot 节点批量生成。
- `composeStoryboard()`：收集结果图和旁白，调后端合成视频。

#### 4.2.6 画布状态扩展

**文件**: `frontend/src/stores/canvas-store.ts`

新增字段：
```ts
storyboardMode: boolean;
storyboardAssets: {
  character?: { url: string; label: string };
  object?: { url: string; label: string };
  scene?: { url: string; label: string };
};
```
新增 action：
- `setStoryboardMode(boolean)`
- `setStoryboardAssets(assets)`
- `loadStoryboardProject(project, assets)`：载入项目时同时设置素材。

#### 4.2.7 工坊到画桥的跳转

**文件**: `frontend/src/pages/WorkshopPage.tsx`

在 `scriptwriter` 与 `visual_designer` 步骤完成后，在步骤卡片区域上方或 Step 5 卡片内增加按钮：
- 「在画布中编辑故事板」
- 点击时收集：
  - `workshopState.scriptwriter_output.shots`
  - `workshopState.visual_output.shot_prompts`
  - `mediaResults.characterImage / objectImage / sceneImage`
  - `extractVoiceoverText()` 旁白
- 调用 `useCreateCanvasProject` 创建新项目，再调用 `loadStoryboardProject` 写入数据，最后导航到 `/#/canvas`。

#### 4.2.8 API Hooks

**文件**: `frontend/src/hooks/use-canvas.ts`

新增：
- `useStoryboardGenerateMutation` → `POST /api/canvas/projects/{id}/storyboard/generate`
- `useStoryboardComposeMutation` → `POST /api/canvas/projects/{id}/storyboard/compose`
- `useCreateStoryboardProject`：创建项目 + 初始 shot 节点（可选，也可复用 `useCreateCanvasProject`）。

### 4.3 后端改动

#### 4.3.1 数据模型

**文件**: `src/canvas/models.py`

新增以下 Pydantic 模型：

```python
class ShotInput(BaseModel):
    shot_id: str
    title: str
    visual_prompt: str
    narration: str = ""
    duration: float = 3.5
    reference_image_url: str | None = None
    reference_type: str | None = None

class StoryboardGenerateRequest(BaseModel):
    shots: list[ShotInput]
    character_ref: str | None = None
    object_ref: str | None = None
    scene_ref: str | None = None
    size: str | None = None
    model: str | None = None

class StoryboardGenerateResult(BaseModel):
    results: list[GenerateResult]

class StoryboardComposeRequest(BaseModel):
    shot_results: list[dict[str, Any]]  # 每个元素含 image_url, narration, duration
    voiceover_text: str | None = None   # 整体旁白，优先于 shot narration 拼接
```

#### 4.3.2 故事板服务

**新文件**: `src/canvas/storyboard_service.py`

保持与 `service.py` 同层，职责单一：
- `batch_generate_shots(db, project_id, user, req)`：
  - 对每个 shot 调用 `image_generation.generate_with_references`。
  - 参考图优先级：`shot.reference_image_url` → `character_ref/object_ref/scene_ref`（按 reference_type）→ 空。
  - 并发控制：使用 `asyncio.gather` 或限制并发数（如 3），避免打满图片生成 API。
  - 更新对应 generate / shot 节点状态（如果前端传入了 node_id）。
- `compose_storyboard_video(db, project_id, user, req)`：
  - 复用 `src/video_compose.py` 或 `src/video_mvp.py` 的合成逻辑。
  - 若提供了 `voiceover_text`，先调 `src/tts_service.py` 生成音频，再与图片合成视频。
  - 返回 `{ video_url, audio_url }`。

#### 4.3.3 路由扩展

**文件**: `src/canvas/router.py`

新增端点：

```python
@router.post("/api/canvas/projects/{project_id}/storyboard/generate")
async def generate_storyboard_api(...):
    """批量为故事板分镜生成图片。"""
    return await batch_generate_shots(...)

@router.post("/api/canvas/projects/{project_id}/storyboard/compose")
async def compose_storyboard_api(...):
    """将故事板分镜图与旁白合成视频。"""
    return await compose_storyboard_video(...)
```

#### 4.3.4 持久化兼容

**文件**: `src/canvas/persistence.py`

- 由于 nodes/edges 以 JSON 存储，新增 `shot` 节点类型不需要改表结构。
- 可选：在 `CanvasProjectSummary` 中增加 `mode` 字段（从 nodes 中推断，或在创建时记录）。

## 5. 布局与交互设计

### 5.1 画布故事板模式布局

```
┌─────────────────────────────────────────────────────────────┐
│  CanvasProjectBar（顶部项目栏）                                │
├──────────┬──────────────────────────────────────┬───────────┤
│          │                                      │           │
│ Toolbar  │         React Flow 无限画布           │ Storyboard│
│  节点    │                                      │ Sidebar   │
│ 拖拽源   │   ShotNode → GenerateNode → ImageNode │  素材库    │
│          │   ShotNode → GenerateNode → ImageNode │  批量操作  │
│          │   ...                                │  时间轴    │
│          │                                      │           │
└──────────┴──────────────────────────────────────┴───────────┘
```

### 5.2 自动排列规则

- 从工坊导入时，默认按 **纵向瀑布流** 排列：每个分镜占一行。
- 每个 ShotNode 坐标：`x = 0, y = index * 240`。
- 每个 ShotNode 右侧 320px 自动生成 GenerateNode。
- 结果图 ImageNode 放在 GenerateNode 右侧 280px。
- 用户可自由拖拽打破自动布局。

### 5.3 侧边栏时间轴（轻量版）

- StoryboardSidebar 底部显示水平缩略图条，按 shot 顺序排列。
- 点击缩略图自动将画布视口定位到对应 ShotNode。
- 不在第一版做复杂时间轴编辑（拖拽排序），仅做导航。

## 6. 假设与决策（Assumptions & Decisions）

1. **复用 React Flow，不引入 tldraw**：项目已有完整 React Flow 基础设施和持久化，迁移成本远低于替换引擎；tldraw 适合自由白板，但对「节点 → 生成 → 结果图」的工作流表达不如 React Flow 直接。
2. **工坊不内嵌画布**：在工坊里嵌入完整无限画布会导致页面复杂、状态难以管理；采用「工坊产出 → 画布消费」的单向数据流更清晰。
3. **ShotNode 是 first-class 节点**：让 shot 成为与 referenceImage/prompt/generate/image 同级的节点，便于未来扩展（如 shot 内嵌子图、shot 连 shot）。
4. **批量生成默认串行**：为避免并发打满图片 API 导致失败，第一版采用串行或 max 3 并发；后续可按设置调整。
5. **视频合成复用现有 `/api/video/compose`**：如果批量生成结果与现有 compose 接口字段兼容，优先复用；若需要 shot 级时长控制，则使用新增 `storyboard/compose`。
6. **不修改数据库 Schema**：nodes/edges JSON 存储足够容纳新节点类型，降低迁移风险。

## 7. 验证步骤（Verification Steps）

### 7.1 单元/类型验证

- `frontend/src/components/canvas/types.ts` 中 `isValidConnection` 的单元测试覆盖 shot 节点连线规则。
- `nodeFactory.ts` 中 `layoutStoryboardShots` 输出预期坐标。
- 后端 `src/canvas/storyboard_service.py` 编写独立测试（mock `image_generation.generate_with_references`），验证批量生成结果数量与参考图透传。

### 7.2 端到端验证

1. 进入 `/workshop`，完成前 5 步（策划、文案、一致性图、脚本、视觉）。
2. 点击「在画布中编辑故事板」，跳转 `/canvas`。
3. 确认画布中自动生成与 shots 数量一致的 ShotNode 阵列。
4. 确认 StoryboardSidebar 显示人物/物品/场景参考图。
5. 拖拽参考图到某个 ShotNode，点击「生成此镜」，右侧出现 ImageNode。
6. 点击「批量生成分镜图」，所有 shot 生成结果图。
7. 点击「一键合成视频」，返回视频 URL 并可播放。
8. 刷新页面，项目从服务端恢复，故事板节点与素材不丢失。

### 7.3 回归验证

- 原有自由画布模式（`/canvas` 不通过工坊进入）仍可正常创建 referenceImage / prompt / generate / image 节点。
- 原有单生成节点 API `POST /api/canvas/projects/{id}/generate` 行为不变。
- 工坊不进入画布时，原有 9 步流程不受影响。

## 8. 文件变更清单

### 前端

- `frontend/src/components/canvas/types.ts` — 扩展类型与连线规则
- `frontend/src/components/canvas/nodeFactory.ts` — shot 节点工厂与自动布局
- `frontend/src/components/canvas/nodes/ShotNode.tsx` — 新增分镜节点组件
- `frontend/src/components/canvas/CanvasFlow.tsx` — 注册 shot 节点类型
- `frontend/src/components/canvas/panels/CanvasToolbar.tsx` — 增加 shot 拖拽项
- `frontend/src/components/canvas/panels/StoryboardSidebar.tsx` — 新增故事板侧边栏
- `frontend/src/components/canvas/panels/NodeInspector.tsx` — 增加 shot 节点属性编辑
- `frontend/src/components/canvas/hooks/useCanvasStoryboard.ts` — 新增故事板逻辑 hook
- `frontend/src/stores/canvas-store.ts` — 扩展故事板模式与素材状态
- `frontend/src/hooks/use-canvas.ts` — 新增故事板相关 API hooks
- `frontend/src/pages/WorkshopPage.tsx` — 增加「在画布中编辑故事板」入口
- `frontend/src/pages/CanvasPage.tsx` — 根据 storyboardMode 渲染 StoryboardSidebar
- `frontend/src/types/api.ts` — 增加 storyboard payload 类型

### 后端

- `src/canvas/models.py` — 新增 Storyboard 相关 Pydantic 模型
- `src/canvas/storyboard_service.py` — 新增批量生成与视频合成服务（新文件）
- `src/canvas/router.py` — 新增 `/storyboard/generate` 与 `/storyboard/compose` 端点
- `src/canvas/persistence.py` — 可选：项目摘要中识别 storyboard 模式
- `tests/test_canvas_storyboard.py` — 新增单元测试（新文件）

## 9. 实施顺序建议

1. **Phase A**：扩展类型系统 + ShotNode UI + 工具栏，实现可拖拽创建空 shot。
2. **Phase B**：工坊导出 payload + 画布自动布局，实现从工坊到画布的一键导入。
3. **Phase C**：后端批量生成接口 + 前端批量生成 UI，实现 shot → image。
4. **Phase D**：视频合成闭环 + StoryboardSidebar 时间轴导航。
5. **Phase E**：测试、打磨交互、补充文档。
