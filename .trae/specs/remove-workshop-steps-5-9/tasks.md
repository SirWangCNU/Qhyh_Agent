# Tasks

- [x] Task 1: 更新工坊步骤配置与类型
  - [x] SubTask 1.1: 在 `lib/constants.ts` 中从 `WorkshopStepKey` 移除 `consistency_images`、`image_gen`、`tts`、`compose` 之外的 5 个 key（实际保留 `NodeKey | "consistency_images"`）
  - [x] SubTask 1.2: 从 `WORKSHOP_STEPS` 数组中删除 `visual_designer`、`distributor`、`image_gen`、`tts`、`compose` 五条配置
  - [x] SubTask 1.3: 将 `DEFAULT_AUTO_RUN_TO` 调整为剩余步骤的最大序号（即 4）

- [x] Task 2: 清理 workshop-store 媒体状态
  - [x] SubTask 2.1: 从 `WorkshopMediaResults` 与状态中移除 `images`、`audioUrl`、`audioPath`、`videoUrl`
  - [x] SubTask 2.2: 移除 `imageGenUseCharacterRef` 字段及其 setter
  - [x] SubTask 2.3: 清理 `persist` / `hydrate` / `DEFAULT_STATE` / `DEFAULT_MEDIA` 中已删除字段
  - [x] SubTask 2.4: 保留 `characterImage`/`objectImage`/`sceneImage` 等一致性生图结果，供画布导出使用

- [x] Task 3: 移除 WorkshopPage 中 5-9 的执行逻辑
  - [x] SubTask 3.1: 移除 `useGenerateImage`、`useGenerateTTS`、`useComposeVideo` 的导入与调用
  - [x] SubTask 3.2: 删除 `execImageGen`、`execTTS`、`execCompose` 函数
  - [x] SubTask 3.3: 保留 `extractVoiceoverText` 函数供导出到画布使用
  - [x] SubTask 3.4: 简化 `executeStep` 的 switch，只保留 `llm` 与 `consistency_images`
  - [x] SubTask 3.5: 删除合成完成后自动调用 `report_generator` 的逻辑
  - [x] SubTask 3.6: 调整页面文案与说明

- [x] Task 4: 清理 WorkshopStepDetail 的渲染分支
  - [x] SubTask 4.1: 删除 `ImageGenRefToggle` 组件
  - [x] SubTask 4.2: 删除 `image_gen` 与 `tts`、`compose` 的 `DetailContent` 分支
  - [x] SubTask 4.3: 简化 `WorkshopStepContent`，移除 `image_gen` 特殊分支

- [x] Task 5: 类型与引用兜底
  - [x] SubTask 5.1: 运行 `npx tsc --noEmit` 检查剩余引用
  - [x] SubTask 5.2: 修复因删除步骤 key 导致的 TypeScript 错误，更新 WorkshopStepList 注释

# Task Dependencies
- Task 1 必须在 Task 2/3/4 之前完成（类型与配置是下游依赖）。
- Task 2 与 Task 3 可并行。
- Task 4 依赖 Task 1（步骤 key 已不存在）。
- Task 5 在所有实现任务完成后执行。
