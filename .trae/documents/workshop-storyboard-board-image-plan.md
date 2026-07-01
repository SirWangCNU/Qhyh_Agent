# 工坊故事板片段 · 导演板生图计划

## 摘要

在工坊 `scriptwriter` 步骤产出的每个 `StorySegment`（≤15s 故事板片段）卡片上，新增「生成导演板图」按钮。点击后**前端直接调用现有 `/api/images/generate`**，把 `Prompt B 全文 + Storyboard Text` 拼接为 prompt 传给生图模型，**不再经过 LLM 翻译**。生成成功后前端把图片 URL 回填到对应片段并展示。

图片尺寸默认使用项目配置 `settings.IMAGE_SIZE`（当前 `1920x1920`），接口允许前端传入 `size` 覆盖。

> ⚠️ 已知权衡：直接拼接 storyboard_text（中文、可能 2000-3000 字、含时间码/状态链等导演指令）作为生图 prompt，会牺牲生成质量（生图模型可能对过长/混杂的 prompt 理解不佳）。用户已明确接受此权衡，换取实现简单与少一次 LLM 调用。

## 当前状态分析

### 已有机制（保留 / 复用）
- **`src/image_generation.py`**：`ImageGenerationRequest` / `ImageGenerationResult` + 异步 `generate_image(request)`，超时 180s，返回 `url` 或 `b64_json`。
- **`src/main.py:197-230`**：`POST /api/images/generate` 端点调用 `generate_image()`，成功后 `record_asset(source="image_gen")` 落库，返回 `{status, model, size, images: [...]}`。本计划直接复用此端点，**无需新增后端 API**。
- **`frontend/src/hooks/use-media.ts:65-70`**：`useGenerateImage()` 已封装 `/api/images/generate`，直接复用。
- **`frontend/src/components/agent/AgentOutputView.tsx:157-189`**：`SegmentCard` 已渲染段头、shots 表、`storyboard_text` 文本块，是添加按钮和图片展示区的自然位置。
- **`frontend/src/stores/workshop-store.ts`**：运行时快照持久化到 sessionStorage，并通过 `useWorkshopAutosave` 每 2s 保存到后端 `/api/workshop/sessions/{id}`；`workshopState` 透传后端 `GenerateResult`。
- **`frontend/src/types/api.ts:226-243`**：`StorySegment` 当前字段：`segment_id, start_time, end_time, duration_seconds, shots, storyboard_text`。
- **`src/models.py`**：`StorySegment` Pydantic 模型 `ConfigDict(extra="forbid")`，新增字段需同步前后端类型，且 LLM 端设默认值避免 prompt 必须输出。

### 缺口（本计划解决）
1. 无 Prompt B 文件（前端需要拿到全文拼 prompt）。
2. `StorySegment` 无字段保存导演板图 URL。
3. 前端 `SegmentCard` 无生图按钮和图片展示区。
4. 前端 store 无更新片段图片 URL 的 action。

## 设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| Prompt B 用法 | 前端把 `Prompt B 全文 + "\n\nStoryboard Text:\n" + storyboard_text` 拼成 prompt，直接调 `/api/images/generate` | 用户已明确「直接调用不再使用大模型处理一次」；少一次网络往返，实现最简 |
| 后端改动 | **零后端改动**（复用 `/api/images/generate`） | 现有端点已支持 `prompt / size / negative_prompt`，且自动落库资产 |
| Prompt B 文件位置 | 前端 `frontend/src/lib/storyboardBoardPrompt.ts` 导出常量字符串 | 不需要后端读取；前端直接 import 拼接，避免额外网络请求 |
| 图片 URL 保存位置 | `StorySegment.storyboard_board_image_url`（后端 Pydantic + 前端 TS 同步） | 与片段强绑定，前端展示和持久化都自然 |
| 默认尺寸 | `settings.IMAGE_SIZE`（1920x1920），前端可不传 size 走默认；接口本身已支持 size 覆盖 | 用户已选「接口允许前端覆盖 size」 |
| 失败处理 | 前端按钮显示 error，可重试 | 不阻断其他片段 |
| 并发 | 单按钮单请求，由用户逐段触发 | 避免一次性 N 段并发导致生图 provider 过载 |

## 提议改动

### A. 前端：新增 Prompt B 常量文件

#### A1. 新建 `qinghe-video/frontend/src/lib/storyboardBoardPrompt.ts`
- 导出 `STORYBOARD_BOARD_PROMPT` 常量，内容 = 用户提供的 Prompt B 全文（角色 / 固定输出布局 / 视觉风格 / 核心目标 / 硬性禁止）。
- 不含动态变量，纯静态字符串。

### B. 后端：扩展 `StorySegment` 保存图片 URL

#### B1. `qinghe-video/src/models.py`
在 `StorySegment` 中新增：
```python
storyboard_board_image_url: str = Field(
    default="", description="该片段导演板图 URL（由用户手动触发生成）"
)
```
- 有默认值，LLM 无需输出，符合 `extra="forbid"`，向后兼容旧会话。

### C. 前端：类型扩展

#### C1. `qinghe-video/frontend/src/types/api.ts`
扩展 `StorySegment`：
```ts
export interface StorySegment {
  segment_id: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  shots: Shot[];
  storyboard_text: string;
  /** 该片段导演板图 URL（用户手动触发生成） */
  storyboard_board_image_url?: string;
}
```

### D. 前端：store 增加更新动作

#### D1. `qinghe-video/frontend/src/stores/workshop-store.ts`
在 `WorkshopState` 接口新增 action：
```ts
setStoryboardBoardImage: (segmentId: number, imageUrl: string) => void;
```
实现逻辑：
1. 读取 `get().workshopState.scriptwriter_output`，若不存在则 return。
2. 深拷贝 `scriptwriter_output` 与 `segments` 数组。
3. 找到 `segment_id === segmentId` 的 segment，设置 `storyboard_board_image_url = imageUrl`。
4. `set({ workshopState: { ...s.workshopState, scriptwriter_output: newSw }, dirty: true, saveStatus: "idle" })`，调用 `persist(get())`。

`useWorkshopAutosave` 会自动把更新后的 `workshopState` 同步到后端会话。

### E. 前端：SegmentCard 添加按钮与图片展示

#### E1. `qinghe-video/frontend/src/components/agent/AgentOutputView.tsx`
改造 `SegmentCard`：
- **按钮**：在段头右侧添加 `🎨 生成导演板图`（小尺寸 outline button）。
  - 默认：可点击
  - loading：`生成中...` disabled
  - 已生成：按钮文案变 `重新生成`，下方展示图片
- **调用**：点击时用 `useGenerateImage()` hook，构造请求：
  ```ts
  {
    prompt: `${STORYBOARD_BOARD_PROMPT}\n\nStoryboard Text:\n${segment.storyboard_text}`,
    size: undefined, // 走后端默认 1920x1920
  }
  ```
- **回填**：`onSuccess` 时取 `data.images[0].url`，调 `useWorkshopStore.getState().setStoryboardBoardImage(segment.segment_id, url)`。
- **图片展示区**：在 `storyboard_text` 区块下方，若 `segment.storyboard_board_image_url` 存在 → `<img src={...} className="w-full rounded-md shadow" />`；不存在则不展示。
- **错误**：按钮下方红色小字显示 error.message，可重试。

#### E2. 图片 URL 处理
`/api/images/generate` 返回的 `images[0].url` 是相对路径（如 `/outputs/image/xxx.jpg`）或完整 URL。前端展示时用 `resolveMediaUrl()`（已在 `use-agents.ts` 导出）补全为完整 URL。

### F. 测试

#### F1. 后端单元测试（修改 `qinghe-video/tests/test_graph.py`）
新增：
```python
def test_story_segment_has_storyboard_board_image_url_default():
    """StorySegment 的 storyboard_board_image_url 默认为空串。"""
    from src.models import StorySegment
    seg = StorySegment(
        segment_id=1, start_time="00:00", end_time="00:15",
        duration_seconds=15.0, shots=[],
    )
    assert seg.storyboard_board_image_url == ""
```
现有 `test_story_segment_model_forbids_extra` 仍通过（新字段有默认值，不破坏）。

#### F2. 验证步骤
1. `pytest tests/ -v` 全绿。
2. `npx tsc --noEmit` 无类型错误。
3. 启动前后端，进入工坊跑完 scriptwriter。
4. 在任意片段点击「生成导演板图」，等待 30-90s，确认：
   - 按钮 loading 状态正常；
   - 生成成功后卡片下方出现图片；
   - `workshopState.scriptwriter_output.segments[N].storyboard_board_image_url` 被更新；
   - 刷新页面后图片 URL 仍存在（sessionStorage + 后端会话恢复）。

## 假设与边界

1. **生成质量权衡**：直接拼接长中文 storyboard_text 作为生图 prompt，质量不如先经 LLM 翻译/压缩。用户已明确接受。
2. **prompt 长度**：storyboard_text 可能 2000-3000 字，加上 Prompt B 全文，总 prompt 可能超过 seedream 的有效理解长度。若生图失败或效果差，可后续在 Prompt B 顶部加「请聚焦核心画面」的压缩指令，或回退到 LLM 翻译方案。
3. **`StorySegment.storyboard_board_image_url` 默认空字符串**：LLM 无需输出，向后兼容旧会话。
4. **前端深拷贝**：`workshopState` 是嵌套对象，更新 segment URL 时必须深拷贝，否则 zustand 不触发重新渲染。
5. **文件规模**：`AgentOutputView.tsx` 改造后预计 < 450 行；`storyboardBoardPrompt.ts` 是纯字符串常量；均符合 < 500 行规范。
6. **资产落库**：复用 `/api/images/generate` 的 `record_asset(source="image_gen")`，导演板图会出现在「我的资产」中。

## 实现顺序

1. 后端扩展 `StorySegment` 模型（B1）。
2. 新增后端测试（F1）。
3. 前端新增 Prompt B 常量文件（A1）。
4. 前端类型扩展（C1）。
5. 前端 store 增加 `setStoryboardBoardImage`（D1）。
6. 前端 `SegmentCard` 加按钮与图片展示（E1）。
7. 运行测试与类型检查（F2）。

## 关键文件清单

**新增（前端）**：
- `qinghe-video/frontend/src/lib/storyboardBoardPrompt.ts`

**修改（后端）**：
- `qinghe-video/src/models.py`（`StorySegment` 加 `storyboard_board_image_url`）

**修改（前端）**：
- `qinghe-video/frontend/src/types/api.ts`（`StorySegment` 扩展字段）
- `qinghe-video/frontend/src/stores/workshop-store.ts`（新增 action）
- `qinghe-video/frontend/src/components/agent/AgentOutputView.tsx`（UI 改造）

**修改（测试）**：
- `qinghe-video/tests/test_graph.py`（新增 1 个模型单测）
