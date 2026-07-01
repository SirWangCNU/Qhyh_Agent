# Checklist

- [x] `generate_with_references` 在 `model` 含 `"gpt-image-2"` 时调用 `_generate_with_references_gpt`
- [x] `_generate_with_references_gpt` 正确收集 ref_urls、组装 prompt、调用 `generate_edit_image`
- [x] `SegmentNodeData` 接口包含 `model?: string`
- [x] `StoryboardSegmentNode` 显示模型下拉（来自 `useCanvasModels` + `FALLBACK_MODEL_OPTIONS`）
- [x] `generateSegment` 请求体包含 `model` 字段
- [x] `generateAllSegments` 请求体包含 `model` 字段（取第一个 pending 段的 model）
- [x] `CanvasProjectBar` 左上角显示返回箭头按钮，点击触发 `navigate(-1)`
- [x] `npx tsc --noEmit` 输出 0 errors
- [x] `py -m pytest tests/ -v` 输出 113 passed
