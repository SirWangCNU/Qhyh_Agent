# Tasks

- [x] Task 1: 后端 `image_generation.py` 增加 gpt-image-2 分支
  - [x] SubTask 1.1: 在 `generate_with_references` 开头增加 `if model and "gpt-image-2" in model:` 早期返回分支
  - [x] SubTask 1.2: 新增 `_generate_with_references_gpt` 辅助函数，复用 `generate_edit_image` 网关

- [x] Task 2: 前端 `types.ts` SegmentNodeData 加 `model?: string` 字段

- [x] Task 3: 前端 `StoryboardSegmentNode` 加模型下拉
  - [x] SubTask 3.1: 导入 `Select` 组件、`FALLBACK_MODEL_OPTIONS`、`useCanvasModels`
  - [x] SubTask 3.2: 在入边状态面板与结果图之间插入模型下拉

- [x] Task 4: 前端 `useCanvasStoryboard` 传 model
  - [x] SubTask 4.1: `generateSegment` 请求体加 `model: d.model || undefined`
  - [x] SubTask 4.2: `generateAllSegments` 请求体加 `model: pending[0].data.model || undefined`

- [x] Task 5: 前端 `CanvasProjectBar` 加返回按钮
  - [x] SubTask 5.1: 导入 `ArrowLeft`、`useNavigate`
  - [x] SubTask 5.2: 在项目名左侧添加 `navigate(-1)` 按钮

- [x] Task 6: 验证
  - [x] SubTask 6.1: `npx tsc --noEmit` — 0 errors
  - [x] SubTask 6.2: `py -m pytest tests/ -v` — 113 passed

# Task Dependencies
- Task 3 depends on Task 2 (needs model field in types)
- Task 4 depends on Task 2 (needs model field in types)
- Task 6 depends on Tasks 1-5
