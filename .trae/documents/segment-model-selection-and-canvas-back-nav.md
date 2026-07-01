# 片段模型选择 + 画布返回工坊导航

## 背景 / Context

用户从工坊导出故事板到无限画布后，在画布上生成段级导演板图时遇到两个问题：

1. **无法选择图片生成模型**：当前段级导演板图固定走 `doubao-seedream` 网关，用户希望像其他生成节点一样在片段节点上选择 `doubao-seedream` 或 `gpt-image-2`。
2. **缺少返回入口**：从分步工坊进入画布后，页面是独立全屏布局，没有明显的返回上一页按钮。

## 当前状态分析

### 已具备的条件
- 后端 `SegmentGenerateRequest` 已经定义了 `model: str | None` 字段（`src/canvas/models.py:210`）。
- 前端 `SegmentGenerateRequestDTO` 也有 `model?: string`（`frontend/src/types/api.ts:601`）。
- 后端 `batch_generate_segments` 会把 `req.model` 传给 `_generate_single_segment`，再传给 `generate_with_references`（`storyboard_service.py:517`、`image_generation.py:428`）。
- 前端已有 `useCanvasModels()` 拉取 `/api/canvas/models` 列表，并有 `FALLBACK_MODEL_OPTIONS` 兜底。
- 前端 `StoryboardSegmentNode` 已改造为生成器节点，有空间添加模型下拉。
- 画布顶部 `CanvasProjectBar` 是添加返回按钮的最合适位置。

### 缺失的部分
- 后端 `generate_with_references` 内部只走 Seedream 网关（`/v1/images/generations`），没有根据 `model` 切换 `gpt-image-2` 服务（`generate_edit_image`）。
- 前端 `SegmentNodeData` 没有 `model` 字段。
- 前端 `StoryboardSegmentNode` 没有模型选择器。
- 前端 `useCanvasStoryboard.ts` 的 `generateSegment` / `generateAllSegments` 没有传 `model`。
- 画布页面没有返回上一页/返回工坊的按钮。

## 改造方案

### 1. 后端：段级生成支持模型切换

**文件 1：`qinghe-video/src/image_generation.py`**

在 `generate_with_references` 函数开头增加模型分支：
- 如果 `model` 包含 `"gpt-image-2"`（或落在 gpt-image-2 模型集合内），调用 `generate_edit_image`。
- 否则保持现有 Seedream 路径。

具体实现：
```python
if model and "gpt-image-2" in model:
    # 把 content_refs / style_refs / structure_refs 中的本地图转成 URL 数组
    ref_urls: list[str] = []
    for ref_url in (content_refs or []) + (style_refs or []) + (structure_refs or []):
        if ref_url and ref_url.startswith("/outputs/"):
            ref_urls.append(ref_url)
    # 调用 gpt-image-2
    results = await generate_edit_image(
        EditImageGenerationRequest(
            model=model,
            prompt=prompt,
            size=size or settings.IMAGE_SIZE,
            n=n or 1,
            image=ref_urls or None,
            watermark=False,
        )
    )
    result = results[0]
    if result.url:
        return result.url
    if result.b64_json:
        # 同现有逻辑写入 /outputs/image/
        ...
    raise RuntimeError("API 返回数据无 url 也无 b64_json")
```

**注意**：`generate_edit_image` 接收的 `image` 是 URL 数组（本地 `/outputs/...` 路径即可，由后端 httpx 直接读取文件），因此不需要额外 base64 编码。需要确认 `gpt-image-2` 服务是否接受本地文件路径；如果不接受，需要把参考图读取为 bytes 再作为 multipart/form-data 上传（当前 `generate_edit_image` 是 JSON 请求，不支持 multipart）。最稳妥的做法是：若 `generate_edit_image` 的 JSON `image` 字段不接受本地路径，则改为在 `generate_with_references` 分支内直接构造 multipart 请求。

**文件 2：`qinghe-video/src/canvas/storyboard_service.py`**

`_generate_single_segment` 调用 `generate_with_references` 时已经传入 `model`，无需修改参数签名，只需确保 `generate_with_references` 的新分支生效。

### 2. 前端：片段节点模型选择

**文件 3：`qinghe-video/frontend/src/components/canvas/types.ts`**

在 `SegmentNodeData` 接口中新增可选字段：
```typescript
/** 本段生成使用的图片模型；未指定时由后端使用 settings.IMAGE_MODEL。 */
model?: string;
```

**文件 4：`qinghe-video/frontend/src/components/canvas/nodes/StoryboardSegmentNode.tsx`**

在节点内容区顶部（标题下方、入边状态面板之前或之后）添加模型下拉：
- 使用 `useCanvasModels()` 获取模型列表，fallback 到 `FALLBACK_MODEL_OPTIONS`。
- 如果只有一个模型，可直接显示文本；如果有多个，渲染 `Select`。
- 选中值写入 `data.model`（`updateNodeData(id, { model: v })`）。
- 生成按钮 disabled 逻辑不变。

**文件 5：`qinghe-video/frontend/src/components/canvas/hooks/useCanvasStoryboard.ts`**

- `generateSegment(segmentNodeId)`：读取 `d.model`，在 `segmentGenerateMutation` 请求体中加入 `model: d.model || undefined`。
- `generateAllSegments()`：读取每个 pending 段节点的 `node.data.model`，在请求体中加入 `model`（当前批量 API 只有 request-level model，因此所有 pending 段共享同一个 model；若需要每段不同模型，则需多次调用或扩展后端。本方案先按 request-level 处理，取第一个 pending 段的 model，或统一取 store 默认值）。

**更优做法**：由于 `SegmentGenerateRequest` 的 `model` 是 request-level，批量生成时所有段使用同一模型。为避免混淆，建议在 `StoryboardSidebar` 的段级操作区也添加一个"批量生成模型"下拉；单个段节点上的 model 下拉用于单独生成。本方案简化为：
- 单段生成：使用段节点自己的 `data.model`。
- 批量生成：使用第一个 pending 段节点的 `data.model`，若未设置则使用 `store.systemPrompt` 旁的默认值或全局默认。

（实现时可以在 `useCanvasStoryboard` 内部增加 `getSegmentModel(node)` 辅助函数。）

**文件 6：`qinghe-video/frontend/src/components/canvas/hooks/useCanvasStoryboard.ts` 的 `loadFromWorkshop`**

导出到画布时，可以给每个段节点设置默认 model：
```typescript
const defaultModel = store.storyboardModel ?? ""; // 如有全局故事板模型则使用
segmentNodes.forEach((n) => {
  if (!n.data.model) {
    store.updateNodeData(n.id, { model: defaultModel });
  }
});
```

### 3. 前端：画布返回上一页/工坊

**文件 7：`qinghe-video/frontend/src/components/canvas/panels/CanvasProjectBar.tsx`**

在项目名左侧添加返回按钮：
```tsx
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const navigate = useNavigate();

<Button
  variant="ghost"
  size="sm"
  className="h-8 w-8 p-0"
  onClick={() => navigate(-1)}
  title="返回上一页"
>
  <ArrowLeft className="h-4 w-4" />
</Button>
```

使用 `navigate(-1)` 比固定 `ROUTES.workshop` 更通用：用户无论从工坊、资产页还是其他页面进入画布，都能回到来源页。若历史栈为空，react-router 会保持当前页（可接受）。

### 4. 环境变量

若要让 `/api/canvas/models` 返回两个模型，需要在 `.env` 中配置：
```bash
IMAGE_MODEL_OPTIONS=doubao-seedream-5-0-260128,gpt-image-2
```

否则默认只返回 `IMAGE_MODEL`（seedream）。计划文档会提醒用户检查此项。

## 关键文件清单

| # | 文件 | 改动 |
|---|---|---|
| 1 | `qinghe-video/src/image_generation.py` | `generate_with_references` 增加 gpt-image-2 分支 |
| 2 | `qinghe-video/src/canvas/storyboard_service.py` | 无需改动，已传 model（验证即可） |
| 3 | `qinghe-video/frontend/src/components/canvas/types.ts` | `SegmentNodeData` 加 `model?: string` |
| 4 | `qinghe-video/frontend/src/components/canvas/nodes/StoryboardSegmentNode.tsx` | 增加模型下拉 |
| 5 | `qinghe-video/frontend/src/components/canvas/hooks/useCanvasStoryboard.ts` | `generateSegment` / `generateAllSegments` 传 model；`loadFromWorkshop` 设默认 model |
| 6 | `qinghe-video/frontend/src/components/canvas/panels/CanvasProjectBar.tsx` | 增加返回按钮 |
| 7 | `qinghe-video/.env`（用户环境） | 可选配置 `IMAGE_MODEL_OPTIONS` |

## 假设与决策

1. **模型判定**：以模型名是否包含 `"gpt-image-2"` 作为分支条件，与现有 `EditImageGenerationRequest.model` 默认值一致。
2. **gpt-image-2 参考图**：复用 `content_refs`（入边 referenceImage 节点收集的 URL）。如果 gpt-image-2 网关不接受本地 `/outputs/...` URL，则改为 multipart 上传；实现时先尝试 JSON `image` 数组，失败再切换。
3. **批量生成模型**：`SegmentGenerateRequest.model` 是 request-level，因此批量生成时所有段使用同一模型（取第一个 pending 段的 model）。单段生成时每段可独立选择模型。
4. **返回按钮**：使用 `navigate(-1)`，不固定到 `/workshop`，兼容所有入口。
5. **向后兼容**：`SegmentNodeData.model` 为可选；未设置时后端使用 `settings.IMAGE_MODEL`，保持现有行为。

## 验证步骤

1. **后端测试**：
   ```powershell
   cd qinghe-video
   pytest tests/ -v
   ```
   预期：113 passed（本次后端改动需谨慎验证 image_generation 分支）。

2. **前端类型检查**：
   ```powershell
   cd qinghe-video/frontend
   npx tsc --noEmit
   ```
   预期：0 errors。

3. **端到端手动验证**（需先启动后端）：
   - 在 `.env` 中设置 `IMAGE_MODEL_OPTIONS=doubao-seedream-5-0-260128,gpt-image-2`
   - 从工坊导出故事板到画布
   - 选中 segment 节点，确认顶部出现模型下拉，可选 seedream / gpt-image-2
   - 切换模型后单段生成，观察是否调用了对应服务
   - 点击 `CanvasProjectBar` 左上角返回按钮，应回到工坊页面
   - 批量生成导演板图时，所有 pending 段使用同一模型

4. **后端分支验证**（可选单元测试）：
   - 在 `tests/test_image_generation.py` 增加一个测试，mock `generate_edit_image` 被调用时返回固定 URL，断言 `generate_with_references(..., model="gpt-image-2")` 返回该 URL。
