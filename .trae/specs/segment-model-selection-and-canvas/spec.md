# Segment Model Selection + Canvas Back Navigation Spec

## Why
段级导演板图生成当前固定使用 `doubao-seedream` 模型，用户无法在画布片段节点上选择 `gpt-image-2`；从工坊进入画布后缺少返回上一页的入口。

## What Changes
- 后端 `generate_with_references` 增加 gpt-image-2 分支，按 `model` 参数自动路由
- 前端 `SegmentNodeData` 新增 `model?: string` 字段
- 前端 `StoryboardSegmentNode` 增加模型下拉选择器（来自 `useCanvasModels`）
- 前端 `useCanvasStoryboard` 的 `generateSegment` / `generateAllSegments` 将 `model` 传入请求体
- 前端 `CanvasProjectBar` 左上角增加返回上一页按钮（`navigate(-1)`）

## Impact
- Affected specs: image_generation, canvas storyboard, canvas UI
- Affected code: `src/image_generation.py`, `frontend/src/components/canvas/types.ts`, `frontend/src/components/canvas/nodes/StoryboardSegmentNode.tsx`, `frontend/src/components/canvas/hooks/useCanvasStoryboard.ts`, `frontend/src/components/canvas/panels/CanvasProjectBar.tsx`

## ADDED Requirements

### Requirement: Segment Model Selection
The system SHALL allow users to select the image generation model (doubao-seedream or gpt-image-2) per storyboard segment node.

#### Scenario: Single segment generation with gpt-image-2
- **WHEN** user selects gpt-image-2 in a segment node's model dropdown and clicks "生成导演板图"
- **THEN** the backend routes the request to `generate_edit_image` (gpt-image-2 service) instead of the default seedream gateway

#### Scenario: Batch generation with model
- **WHEN** user clicks "批量生成导演板图" in StoryboardSidebar
- **THEN** the batch request carries the first pending segment's `model` value; all segments in the batch use the same model

#### Scenario: Default model fallback
- **WHEN** no model is selected (dropdown shows "默认")
- **THEN** the backend uses `settings.IMAGE_MODEL` (seedream)

### Requirement: Canvas Back Navigation
The system SHALL provide a back button in the canvas project bar to return to the previous page.

#### Scenario: Navigate back from canvas
- **WHEN** user clicks the back arrow button in CanvasProjectBar
- **THEN** the browser navigates to the previous page in history (e.g., workshop, home)
