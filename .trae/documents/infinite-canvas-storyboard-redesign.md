# 无限画布故事板重新设计 · 实施计划

> 状态：待用户确认（Plan Mode）
> 关联指令：frontend-design skill + 联网调研（tldraw / Excalidraw / PonPon Canvas / infinite-canvas 范式）
> 用户决策（已确认）：① 把工坊"生成故事板"入口替换为"进入画布操作（无限画布 + 04b 故事板文本 + 系统提示词 + 资产）生成故事板"　② 继续用 React Flow（`@xyflow/react` v12）　③ SegmentCard 的"生成导演板图"按钮改为跳转画布

---

## 一、Summary 摘要

把工坊里"生成导演板图"这个**段级单图直生**的能力，升级为"**跳转无限画布 → 在画布上用 04b 故事板文本 + STORYBOARD_BOARD_PROMPT 系统提示词 + 人物/物品/场景一致性资产 → 生成段级导演板图**"的工作流。

核心做法：在现有 React Flow 画布（`CanvasPage` 的 storyboard 模式）中**新增一种段级节点 `StoryboardSegmentNode`**，承载该段的 04b 故事板文本、系统提示词、资产绑定与段级导演板图生成状态；后端新增段级生成端点，复用 `generate_with_references` 注入人物/物品/场景参考图；工坊 SegmentCard 的"生成导演板图"按钮改为"在画布中生成故事板"跳转入口。同时按 frontend-design 指导重新设计画布故事板侧栏与节点视觉，采用"电影预演工作台"美学方向。

**产物定义（关键）**：本次"故事板"指**段级导演板图**（一张含 HEADER / START FRAME / SHOT GRID / CAMERA RHYTHM / SOUND BEAT 等布局的单图，即 `STORYBOARD_BOARD_PROMPT` 的产物），不是 shot 级分镜图。现有 `ShotNode`（shot 级分镜）能力保留，但本次不自动生成、不在导出 payload 中强制携带。

---

## 二、Current State Analysis 现状分析

### 2.1 工坊 SegmentCard（现状：段级直生单图）
- 文件：[AgentOutputView.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/agent/AgentOutputView.tsx#L175-L304)
- `SegmentCard` 每段一个"生成导演板图"按钮（`AgentOutputView.tsx:188-217` 的 `handleGenerate`）
- 逻辑：`prompt = STORYBOARD_BOARD_PROMPT + "\n\nStoryboard Text:\n" + segment.storyboard_text`，直接调 `POST /api/images/generate`（doubao-seedream）或 `POST /api/images/edit-generate`（gpt-image-2），生一张段级导演板图，回写 `storyboard_board_image_url`
- **缺陷**：① 不注入人物/物品/场景资产参考图（一致性差）② 单段孤立生成，无空间组织/迭代/变体并排 ③ 无系统提示词可视化

### 2.2 工坊 → 画布导出（现状：只用扁平 shots，没 04b 文本）
- 文件：[WorkshopPage.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/pages/WorkshopPage.tsx#L318-L387)
- `buildStoryboardPayload`（`WorkshopPage.tsx:318-349`）：以 `scriptwriter_output.shots` 为基准，构造 `StoryboardPayload`，含 `shots / character_ref / object_ref / scene_ref / voiceover_text`
- **关键缺口**：**完全没有导入 `segments[].storyboard_text`（04b 文本）和 `STORYBOARD_BOARD_PROMPT`**
- `handleExportToCanvas`（`WorkshopPage.tsx:356-387`）：创建画布项目 → `loadProject` → `storyboard.loadFromWorkshop(payload)` → `navigate(ROUTES.canvas)`

### 2.3 画布故事板模式（现状：shot 级，无段级）
- [CanvasPage.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/pages/CanvasPage.tsx)：`mode === "storyboard"` 时渲染 `StoryboardSidebar`，否则 `NodeInspector`
- [canvas-store.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/stores/canvas-store.ts#L40-L77)：`StoryboardAssets {character?,object?,scene?}`、`storyboardVoiceover`、`mode: "free"|"storyboard"`
- [useCanvasStoryboard.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/canvas/hooks/useCanvasStoryboard.ts#L66-L102) `loadFromWorkshop`：用 `makeShotNodes` 生成纵向 ShotNode 阵列（`rowGap:280`），设素材库 + 旁白，切 storyboard 模式。**没生成段级节点**
- `generateShot` / `generateAllShots`（`useCanvasStoryboard.ts:110-249`）：走 `POST /api/canvas/projects/{id}/storyboard/generate`（shot 级批量）
- `composeStoryboard`（`useCanvasStoryboard.ts:256-301`）：走 `POST /api/canvas/projects/{id}/storyboard/compose`

### 2.4 后端 canvas 模型（现状：无段级字段）
- 文件：[src/canvas/models.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/canvas/models.py)
- `ShotInput`（`models.py:107-123`）：`shot_id / title / visual_prompt / narration / duration / reference_image_url / reference_type / node_id`
- `StoryboardGenerateRequest`（`models.py:126-135`）：`shots / character_ref / object_ref / scene_ref / size / model / concurrency`
- **无 segment 级的 storyboard_text / system_prompt 字段**
- [storyboard_service.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/canvas/storyboard_service.py) `batch_generate_shots`（`storyboard_service.py:184-237`）：逐 shot 生图，参考图优先级 `shot.reference_image_url → character/object/scene_ref → 文生图`
- [image_generation.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/image_generation.py) `generate_with_references`（`image_generation.py:259-419`）：支持 `content_refs / style_refs / structure_refs` 多参考图，doubao-seedream gateway 多图时 content 转 base64 数组，style/structure 注入 prompt 文字

### 2.5 数据模型字段
- [src/models.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/models.py#L144-L150) `StorySegment`：`storyboard_text`（04b 文本）+ `storyboard_board_image_url`（段级导演板图 URL）
- 前端 `STORYBOARD_BOARD_PROMPT` 常量在 [storyboardBoardPrompt.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/lib/storyboardBoardPrompt.ts)，后端无对应副本

### 2.6 调研结论（主流做法）
- **PonPon Canvas / tldraw / infinite-canvas** 共同范式：节点化（文本/图片/配置节点 + 连线）、画布内直接生成（右键生图落回原位）、空间分区（frames/sections）、变体并排 A/B、故事板时间轴 strip
- **tldraw** 最专业但生产需 ~$6000/年授权（dev/localhost 免费）→ 用户已选继续用 React Flow，零迁移成本
- **可借鉴**：段级分区布局、画布内右键/按钮生图落回节点、变体并排、资产拖拽绑定

---

## 三、Proposed Changes 改动方案

### 3.1 后端：新增段级故事板生成端点

**目标**：接收段级 04b 文本 + 系统提示词 + 资产参考图，生成段级导演板图，回写画布节点状态。

**文件 1：`src/canvas/models.py`（新增模型）**
在 `ShotInput` 之后新增：
```python
class SegmentInput(BaseModel):
    """单个故事板片段输入（段级导演板图生成）。"""
    segment_id: str = Field(..., description="片段 id（来自 scriptwriter_output.segments）")
    storyboard_text: str = Field(..., min_length=1, description="04b 故事板文本")
    system_prompt: str | None = Field(
        None, description="段级导演板系统提示词；未传则用后端默认 STORYBOARD_BOARD_PROMPT"
    )
    title: str = Field("", description="片段标题，如「片段 1」")
    node_id: str | None = Field(None, description="前端 StoryboardSegmentNode 节点 id，用于回写")

class SegmentGenerateRequest(BaseModel):
    """段级故事板批量生成请求。"""
    segments: list[SegmentInput] = Field(..., min_length=1)
    character_ref: str | None = None
    object_ref: str | None = None
    scene_ref: str | None = None
    size: str | None = None          # 默认 "1920x1920"
    model: str | None = None
    concurrency: int = Field(3, ge=1, le=8)

class SegmentGenerateResult(BaseModel):
    """段级生成单条结果。"""
    node_id: str
    status: GenerateStatus
    result_image_url: str | None = None
    error: str | None = None

class SegmentGenerateResponse(BaseModel):
    results: list[SegmentGenerateResult] = Field(default_factory=list)
```

**文件 2：`src/canvas/storyboard_board_prompt.py`（新建，后端默认系统提示词）**
- 把前端 `frontend/src/lib/storyboardBoardPrompt.ts` 的 `STORYBOARD_BOARD_PROMPT` 全文复制为 Python 常量 `STORYBOARD_BOARD_PROMPT`
- 头部注释说明：与前端保持同步，若改动需两端同步
- 提供未来从 `.env` / 配置覆盖的钩子（本次仅常量即可）

**文件 3：`src/canvas/storyboard_service.py`（新增段级生成函数）**
新增 `batch_generate_segments(req, project_id) -> SegmentGenerateResponse`：
- `asyncio.Semaphore(req.concurrency)`，默认 3，上限 8（参照现有 `batch_generate_shots` 的并发模式，`storyboard_service.py:184-237`）
- 对每个 segment：`prompt = (seg.system_prompt or STORYBOARD_BOARD_PROMPT) + "\n\nStoryboard Text:\n" + seg.storyboard_text`
- 调 `image_generation.generate_with_references`，把 `character_ref / object_ref / scene_ref` 作为 `content_refs`（去 None、去重），size 用 `req.size or "1920x1920"`，model 用 `req.model`
- 每个 segment 独立 try/except，单段失败不影响其他段
- 成功后 `record_asset(source="canvas", media_type="image", ...)`（参照 `storyboard_service.py` 现有 `record_asset` 调用）
- 结果按 `node_id` 组织返回 `SegmentGenerateResponse`
- **不写回 ShotNode**（段级产物独立，与 shot 级解耦）

**文件 4：`src/canvas/router.py`（新增路由）**
在现有 `POST /api/canvas/projects/{id}/storyboard/generate`（`router.py:241-267`）之后新增：
```python
@router.post("/projects/{project_id}/storyboard/segment-generate")
async def segment_generate(...): -> SegmentGenerateResponse
```
- `Depends(get_current_user)`（与其他 canvas 路由一致）
- 调 `storyboard_service.batch_generate_segments`

**文件 5：`src/main.py`（SPA 路由无需改动）**
- 段级端点是 API，不涉及 SPA 路由，无需改 `spa_routes`

### 3.2 前端类型：扩展 StoryboardPayload 与 DTO

**文件：`frontend/src/types/api.ts`**
- 新增 `SegmentInputDTO` / `SegmentGenerateRequestDTO` / `SegmentGenerateResultDTO` / `SegmentGenerateResponseDTO`（镜像后端模型）
- 扩展 `StoryboardPayload`：新增可选字段 `segments?: { segment_id: string; storyboard_text: string; title: string }[]`
- 现有 `shots` 字段保留但标记为可选（本次导出默认不携带 shots）

### 3.3 前端状态：canvas-store 扩展

**文件：`frontend/src/stores/canvas-store.ts`**
- `CanvasState` 新增：
  - `systemPrompt: string`（画布级默认系统提示词，初始化为前端 `STORYBOARD_BOARD_PROMPT`，可后续可编辑）
  - 无需新增 segment 节点专用状态（段级节点走通用 `nodes` 数组，data 里带 `kind: "segment"`）
- 新增 action：`setSystemPrompt(text: string)`

### 3.4 前端节点：新增 StoryboardSegmentNode

**文件 1：`frontend/src/components/canvas/types.ts`（扩展节点数据类型）**
新增 `SegmentNodeData`：
```ts
export interface SegmentNodeData {
  kind: "segment";
  segmentId: string;
  title: string;            // "片段 1"
  storyboardText: string;   // 04b 文本
  systemPrompt: string;      // 本段系统提示词（默认 = 画布 systemPrompt，可单独覆盖）
  // 生成状态
  status: "idle" | "running" | "done" | "error";
  resultImageUrl: string | null;
  error: string | null;
  // 资产绑定（可空，空则用画布全局素材库）
  characterRef?: string;
  objectRef?: string;
  sceneRef?: string;
}
```

**文件 2：`frontend/src/components/canvas/nodeFactory.ts`（新增工厂函数）**
新增 `makeSegmentNodes(segments, { startX, startY, colGap, rowGap })`：
- 每段一个 `StoryboardSegmentNode`，纵向瀑布流布局（参照现有 `makeShotNodes` 的 `rowGap:280` 模式，段间距加大到 `rowGap:420`，给 04b 文本留展示空间）
- 节点宽度统一（如 360px），高度自适应内容

**文件 3：`frontend/src/components/canvas/nodes/StoryboardSegmentNode.tsx`（新建，frontend-design 重点）**
节点 UI（美学方向见 §3.7）：
- 顶部：段号 Badge + 标题 + 状态指示灯（idle/running/done/error 四色）
- 中部：04b 故事板文本区（可折叠，默认展开，等宽字体，`max-h` + 滚动，遵循 memory 约束"完整文本不截断"→ 用 `whitespace-pre-wrap` + 滚动而非 `truncate`）
- 系统提示词区：可折叠展示本段 `systemPrompt`（默认折叠，显示首行 + "…查看完整系统提示词"）
- 资产绑定区：三个 slot（人物/物品/场景），显示缩略图或"未绑定"，点击从素材库应用
- 结果图区：有 `resultImageUrl` 显示 `<img>`（`object-contain` + `w-full h-auto`，遵循 memory"无黑边、适应容器"约束），无则占位提示
- 底部：操作按钮「生成导演板图」「重新生成」「在画布中编辑提示词」
- React Flow Handles：左侧 target（接收资产/提示词连线）+ 右侧 source（可拉线到 ShotNode 或其他节点）

**文件 4：`frontend/src/components/canvas/CanvasFlow.tsx`（注册新节点类型）**
- 在 `nodeTypes` 注册表加 `segment: StoryboardSegmentNode`
- 现有 `shot: ShotNode` 保留

### 3.5 前端 hook：扩展 useCanvasStoryboard

**文件：`frontend/src/components/canvas/hooks/useCanvasStoryboard.ts`**

1. **`loadFromWorkshop` 扩展**（`useCanvasStoryboard.ts:66-102`）：
   - 若 `payload.segments` 存在且非空：调 `makeSegmentNodes` 生成 `StoryboardSegmentNode` 阵列，`store.addNodes(segmentNodes)`
   - 现有 `makeShotNodes` 逻辑**默认不再执行**（本次聚焦段级），除非 `payload.shots` 显式存在（向后兼容旧调用）
   - 仍设素材库 + 旁白 + `mode: "storyboard"`
   - 若 payload 带 `systemPrompt`：`store.setSystemPrompt(payload.systemPrompt)`

2. **新增 `generateSegment(nodeId)`**：单段生成
   - 收集该段节点 data，构造 `SegmentInputDTO`（含 `system_prompt`）
   - 调 `POST /api/canvas/projects/{id}/storyboard/segment-generate`（concurrency=1）
   - 按 `node_id` 回写状态 + `resultImageUrl`

3. **新增 `generateAllSegments()`**：批量生成所有 idle/error 段
   - 参照现有 `generateAllShots`（`useCanvasStoryboard.ts:183-249`）的批量模式
   - 调一次段级批量 API（concurrency=3），按 `node_id` Map 回写

4. **`composeStoryboard` 保持不变**（合成仍基于 done 状态的 shot 节点；若本次没有 shot 节点，合成按钮禁用并提示"段级导演板图不参与视频合成，如需合成视频请在画布中生成 ShotNode 分镜图"）

**文件：`frontend/src/hooks/use-canvas.ts`**
- 新增 `useSegmentGenerateMutation()`（react-query mutation，调段级端点）

**文件：`frontend/src/lib/api.ts`**
- 新增 `canvasSegmentGenerate(projectId, body)` 封装 fetch

### 3.6 前端工坊：SegmentCard 按钮改造 + payload 扩展

**文件 1：`frontend/src/components/agent/AgentOutputView.tsx`**（`SegmentCard`，`AgentOutputView.tsx:175-304`）
- 移除 `handleGenerate` 的直生图逻辑（`AgentOutputView.tsx:188-217`）和 `useGenerateImage` / `useGenerateEditImage` 依赖
- 模型选择 `Select`（`AgentOutputView.tsx:231-242`）移除（模型在画布里选）
- "生成导演板图"按钮（`AgentOutputView.tsx:243-256`）改为「在画布中生成故事板」按钮：
  - 点击后调用从 `WorkshopPage` 传入的 `onOpenInCanvas(segmentId?)` 回调
  - 若传 `segmentId`：跳转画布并定位到该段节点（通过 `canvasStore` 的 `selectedNodeId` + `fitView`）
  - 若不传：跳转画布（导出全部段）
- 导演板图结果区（`AgentOutputView.tsx:281-302`）改为"在画布中查看"引导卡片（若该段已有画布生成的图，可显示缩略图 + "在画布中打开"）
- 04b 故事板文本区（`AgentOutputView.tsx:259-272`）保留展示（只读）

**文件 2：`frontend/src/pages/WorkshopPage.tsx`**（`buildStoryboardPayload`，`WorkshopPage.tsx:318-349`）
- 改造 `buildStoryboardPayload`：以 `scriptwriter_output.segments` 为基准构造 `segments`：
  ```ts
  const segments = (sw.segments ?? []).map((seg, idx) => ({
    segment_id: seg.segment_id,
    title: `片段 ${idx + 1}`,
    storyboard_text: seg.storyboard_text,   // 04b 文本
  }));
  return {
    segments,
    // shots 保留但可选（默认不传，本次聚焦段级）
    character_ref: m.characterImage?.url,
    object_ref: m.objectImage?.url,
    scene_ref: m.sceneImage?.url,
    voiceover_text: extractVoiceoverText(),
    systemPrompt: STORYBOARD_BOARD_PROMPT,   // 新增：传系统提示词到画布
  };
  ```
- `canExportStoryboard`（`WorkshopPage.tsx:390-391`）条件改为：`steps.scriptwriter === "done" && segments.length > 0 && segments.every(s => s.storyboard_text?.trim())`
- `handleExportToCanvas`（`WorkshopPage.tsx:356-387`）保持流程不变，payload 内容已扩展
- 若 SegmentCard 传入 `onOpenInCanvas(segmentId)`：`handleExportToCanvas` 可带 `focusSegmentId` 参数，跳转后通过 `canvasStore.setSelected(segmentNodeId)` + CanvasFlow `fitView` 定位

**文件 3：`frontend/src/components/agent/AgentOutputView.tsx` 的 `ScriptwriterView`**（`AgentOutputView.tsx:134-172`）
- 把 `onOpenInCanvas` 从 `WorkshopPage` 透传到每个 `SegmentCard`

### 3.7 前端画布 UI：StoryboardSidebar 重新设计（frontend-design 重点）

**美学方向：电影预演工作台 / Editorial Cinema Lab**
- **基调**：深色画布（墨黑 `#0E0F12` / 深炭灰背景），暖琥珀强调色（胶片橙 `#E8A33D`），辅以青灰冷调（`#6B7A8F`）做次要状态
- **字体**：display 用 `Instrument Serif`（电影感衬线，用于段标题/侧栏标题）；等宽用 `JetBrains Mono`（04b 文本、shot_id、状态标签）；body 用 `Geist`（与现代 SPA 协调）。仅在画布页面局部加载，不全局替换
- **画布背景**：细微噪点纹理（SVG turbulence 或 base64 noise）+ 暗角径向渐变 + 极淡网格点（`radial-gradient` dot pattern），营造工作台深度
- **节点视觉**：胶片帧质感——细边框（1px `rgba(232,163,61,0.2)`）、顶部 4px 状态色条（idle 灰 / running 琥珀呼吸 / done 青绿 / error 砖红）、角标微圆角（6px）、内部分区用 1px 虚线分隔
- **微动效**：节点首次挂载 staggered reveal（`animation-delay` 按段序递增 80ms）；状态切换时状态条色彩 transition + 轻微 scale；生成中状态条琥珀色 `pulse` 呼吸（2s ease-in-out infinite）
- **反 AI slop**：禁用紫渐变白底、禁用 Inter/Roboto、禁用通用卡片三栏布局；用胶片帧 + 等宽技术文本 + 暖琥珀强调体现"导演工作台"语境

**文件 1：`frontend/src/components/canvas/panels/StoryboardSidebar.tsx`（重新设计）**
重新组织为四个分区（自上而下）：
1. **系统提示词区**：可折叠卡片，展示画布级 `systemPrompt`（默认 `STORYBOARD_BOARD_PROMPT`），支持"展开查看完整"（等宽字体，`whitespace-pre-wrap`，遵循"完整文本不截断"约束）
2. **素材库区**：人物/物品/场景三个 slot，缩略图（`object-contain` + `w-full h-auto` 无黑边），点击应用到当前选中段节点；支持上传/替换
3. **段级操作区**：按钮「生成全部段导演板图」（调 `generateAllSegments`）+ 段导航（水平缩略图条，点击定位到对应段节点）
4. **shot 级操作区**（保留但弱化）：按钮「批量生成分镜图」+「合成视频」（现有逻辑，标注"可选 · 细粒度"）
- 视觉：深色卡片背景（`bg-card/80 backdrop-blur`），琥珀色 CTA 主按钮，等宽字体显示段号/状态

**文件 2：`frontend/src/components/canvas/nodes/ShotNode.tsx`**（保留，仅微调视觉对齐新美学）
- 状态色条、字体与 StoryboardSegmentNode 保持一致
- 不改功能逻辑

**文件 3：`frontend/src/index.css` 或 `frontend/src/components/canvas/canvas.css`（新建）**
- 引入 `Instrument Serif` / `JetBrains Mono` / `Geist`（`@import` Google Fonts 或 `@fontsource`，优先 `@fontsource` 离线包）
- 定义画布专用 CSS 变量：`--canvas-bg / --canvas-accent / --canvas-status-idle|running|done|error`
- 噪点纹理 + 暗角渐变 + 网格点的背景类
- 节点 staggered reveal / 状态条 pulse 的 keyframes

**文件 4：`frontend/src/pages/CanvasPage.tsx`**（微调）
- 当 `mode === "storyboard"` 且存在 `kind==="segment"` 节点时，渲染新 `StoryboardSidebar`
- 空状态文案（`CanvasPage.tsx:98-125`）保持

### 3.8 前端画布：右键生图（可选增强，借鉴 PonPon Canvas）
**本次不做**，列为后续增强。本次聚焦段级节点的按钮触发生成。

---

## 四、Assumptions & Decisions 假设与决策

1. **产物 = 段级导演板图**：本次"故事板"指 `STORYBOARD_BOARD_PROMPT` 的段级产物（含 SHOT GRID 布局的单图），不是 shot 级分镜图。shot 级 ShotNode 保留但不在本次导出/自动生成范围内。
2. **资产参考图注入方式**：段级生成时，`character_ref / object_ref / scene_ref` 全部作为 `content_refs` 传给 `generate_with_references`（去 None 去重）；doubao-seedream gateway 多图时自动转 base64 数组（现有降级逻辑已支持，`image_generation.py:334-335`）。
3. **系统提示词双存储**：前端 `lib/storyboardBoardPrompt.ts` 与后端新建 `src/canvas/storyboard_board_prompt.py` 各存一份常量，需保持同步（计划中注明）。`SegmentInput.system_prompt` 可选，未传则用后端默认。
4. **不破坏现有 shot 级能力**：现有 `ShotNode` / `generateShot` / `generateAllShots` / `composeStoryboard` 全部保留可用。`loadFromWorkshop` 默认改为只生成段级节点；若 payload 带 `shots` 仍向后兼容生成 ShotNode。
5. **段级不参与视频合成**：`composeStoryboard` 仍基于 done 状态 ShotNode；段级导演板图不直接进视频合成管线（段级是规划产物，shot 级才是成片素材）。UI 上明确标注。
6. **回写不写回工坊**：画布生成的段级导演板图**不回写** `workshopState.scriptwriter_output.segments[].storyboard_board_image_url`（画布是独立创作空间，与工坊状态解耦）。工坊 SegmentCard 显示的导演板图仍由工坊侧字段决定（可后续做"从画布同步回工坊"的按钮，本次不做）。
7. **字体加载**：用 `@fontsource` 离线包（`@fontsource/instrument-serif` / `@fontsource/jetbrains-mono` / `@fontsource/geist`），避免依赖 Google Fonts CDN（sandbox 友好、生产可控）。需 `npm install` 三个包。
8. **文件大小合规**：所有新文件 < 500 行（AGENTS.md 约束）。`StoryboardSegmentNode.tsx` 若超 500 行则拆出 `StoryboardSegmentNodeBody` / `AssetSlots` 子组件。
9. **Pydantic 严格模式**：新模型不加 `extra="forbid"` 之外的额外字段，字段名与 DTO 对齐。
10. **路由无新增**：复用现有 `/#/canvas` 路由，不新增 SPA 路由，不改 `routes/index.tsx`。

---

## 五、Implementation Steps 实施步骤（建议顺序）

1. **后端**：`src/canvas/storyboard_board_prompt.py`（常量）→ `src/canvas/models.py`（新模型）→ `src/canvas/storyboard_service.py`（`batch_generate_segments`）→ `src/canvas/router.py`（新路由）
2. **前端类型**：`frontend/src/types/api.ts`（DTO + StoryboardPayload 扩展）
3. **前端状态**：`frontend/src/stores/canvas-store.ts`（`systemPrompt` + `setSystemPrompt`）
4. **前端节点**：`types.ts`（SegmentNodeData）→ `nodeFactory.ts`（makeSegmentNodes）→ `StoryboardSegmentNode.tsx`（新建）→ `CanvasFlow.tsx`（注册）
5. **前端 hook**：`use-canvas.ts`（mutation）→ `lib/api.ts`（fetch）→ `useCanvasStoryboard.ts`（loadFromWorkshop 扩展 + generateSegment + generateAllSegments）
6. **前端工坊**：`WorkshopPage.tsx`（buildStoryboardPayload 扩展 + onOpenInCanvas）→ `AgentOutputView.tsx`（SegmentCard 按钮改造）
7. **前端画布 UI**：`canvas.css`（字体 + 变量 + 背景 + 动效）→ `StoryboardSidebar.tsx`（重新设计）→ `ShotNode.tsx`（视觉对齐）→ `CanvasPage.tsx`（微调）
8. **字体安装**：`cd frontend && npm install @fontsource/instrument-serif @fontsource/jetbrains-mono @fontsource/geist`

---

## 六、Verification 验证步骤

1. **后端单测（无 LLM key）**：
   - 新增 `tests/test_canvas_segment.py`：验证 `SegmentInput` / `SegmentGenerateRequest` 模型校验（必填字段、min_length、concurrency 边界）
   - 验证 `STORYBOARD_BOARD_PROMPT` 常量非空且与前端 `storyboardBoardPrompt.ts` 内容一致（字符串比对测试）
   - 验证未认证访问 `POST /api/canvas/projects/{id}/storyboard/segment-generate` 返回 401
   - `pytest tests/ -v` 全绿

2. **前端类型检查**：`cd frontend && npx tsc --noEmit` 零错误

3. **前端 lint**：`cd frontend && npm run lint` 零错误

4. **手动联调**（需 LLM + 图片 key）：
   - `.\run.ps1` 启动前后端
   - 工坊跑完 4 步到 scriptwriter，确认每段有 04b `storyboard_text`
   - 点 SegmentCard 的「在画布中生成故事板」→ 跳转 `/#/canvas`
   - 画布显示 N 个 StoryboardSegmentNode（N = 段数），每个含 04b 文本
   - 素材库显示人物/物品/场景缩略图
   - 系统提示词区展示完整 `STORYBOARD_BOARD_PROMPT`
   - 点单段「生成导演板图」→ 状态 running → done → 显示结果图（无黑边，`object-contain`）
   - 点「生成全部段导演板图」→ 批量生成，并发 3
   - 验证资产参考图注入：对比有/无资产时生成结果的人物一致性
   - 04b 文本完整显示不截断（折叠/展开切换正常）
   - 视觉检查：深色画布、琥珀强调、胶片帧节点、staggered 动效符合美学方向，无 AI slop（无紫渐变白底、无 Inter）

5. **回归**：现有 `ShotNode` 拖入、生成、合成视频流程不受影响

---

## 七、Out of Scope（本次不做）

- 右键画布生图（PonPon Canvas 式）——后续增强
- 段级导演板图回写工坊 `storyboard_board_image_url`——后续增强
- tldraw / Excalidraw 迁移——用户已否决
- shot 级分镜图导出/自动生成——保留现有能力，本次不扩展
- 多人协作 / 持久化历史版本——不在本次范围
- 从画布同步回工坊——后续增强
