# 删除工坊步骤 5-9 Spec

## Why
当前分步 Agent 工坊（WorkshopPage）包含 9 个步骤：策划→文案→一致性生图→脚本→视觉→投放→出图→配音→合成。为了让工坊聚焦于「策划/文案/一致性/脚本」这前半段创意流程，后半段涉及视觉定义、投放策略、媒体生成与合成的步骤 5-9 需要从工坊 UI 中移除，减少用户认知负担并避免展示暂时不使用的功能。

## What Changes
- **BREAKING**: 从 `WORKSHOP_STEPS` 配置中移除步骤 5-9（`visual_designer`、`distributor`、`image_gen`、`tts`、`compose`）。
- **BREAKING**: 从 `WorkshopStepKey` 联合类型中移除上述 5 个 key。
- 移除 `WorkshopPage` 中与 `image_gen`、`tts`、`compose` 相关的执行函数与 API hooks 引用。
- 移除 `WorkshopStepDetail` 中针对 `image_gen`、`tts`、`compose` 的渲染分支（图片画廊、音频播放器、视频播放器、图生图开关）。
- 移除/简化 `workshop-store` 中仅服务于被删步骤的状态字段：`mediaResults`（images/audioUrl/audioPath/videoUrl）、`imageGenUseCharacterRef` 及其 setter。
- 保留 `report_generator` 作为 pipeline 内部节点，但不在工坊步骤列表中展示；合成完成后的自动报告生成逻辑一并移除。
- 保留一致性生图（步骤 3）和脚本（步骤 4）不变，并确保步骤 4 完成后仍可导出到无限画布故事板。
- 保留 `use-media.ts`、`types/api.ts` 中底层 API 类型与 hook 不动（画布故事板仍可能使用）。
- 更新页面文案，从「九道农事工序」/「前 5 步自动跑完」改为与剩余 4 步一致。

## Impact
- Affected specs: 分步 Agent 工坊 UI、工坊状态持久化、自动执行流程。
- Affected code:
  - `qinghe-video/frontend/src/lib/constants.ts`
  - `qinghe-video/frontend/src/stores/workshop-store.ts`
  - `qinghe-video/frontend/src/pages/WorkshopPage.tsx`
  - `qinghe-video/frontend/src/components/workshop/WorkshopStepDetail.tsx`
  - `qinghe-video/frontend/src/components/workshop/WorkshopStepList.tsx`（注释更新）

## REMOVED Requirements
### Requirement: 工坊步骤 5-9 UI 与执行
**Reason**: 工坊聚焦前半段创意流程，视觉/投放/出图/配音/合成改由无限画布故事板模式承载。
**Migration**: 已有用户若依赖这 5 步，可在脚本+视觉就绪后点击「在画布中编辑故事板」进入画布继续。
