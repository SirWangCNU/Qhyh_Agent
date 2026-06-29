# 一致性生图 B1 收尾计划（出图步骤参考图传递 — 前端）

## Summary

一致性生图改进功能已实施约 90%。A 期（Prompt 模板优化 + UI 交互增强 + visual_designer 分镜联动）全部完成并验证通过；B1 后端（`image_generation.py` 支持参考图字段 + `_resolve_reference_image`）也已完成。

**本计划仅覆盖 B1 剩余的前端收尾工作**：3 处小改动 + 最终验证。完成后 B1 即闭环——用户在第 7 步「出图」可勾选「使用人物参考图」，让分镜图与第 3 步的角色设定集视觉一致（图生图）。

参考完整计划：`consistency-images-improvement.md`（B1 章节）。

---

## Current State Analysis

### 已完成（无需改动）

- **后端** `src/image_generation.py`：
  - `ImageGenerationRequest` 已含 `reference_image_path: str | None` 字段
  - `_resolve_reference_image(path_str)` 取 basename 防 path traversal，解析 `outputs/image/` 下文件
  - `generate_image()` 已支持读参考图 → base64 data URI → payload `image` 字段（图生图），文件缺失静默降级文生图
- **前端类型** `types/api.ts`：
  - `ImageGenerationRequest` 已含 `reference_image_path?: string`
- **Store 状态** `workshop-store.ts`：
  - `imageGenUseCharacterRef: boolean` 已在 state 接口、DEFAULT_STATE（false）、`setImageGenUseCharacterRef` action、persist snapshot 中就位
  - `setConsistencyReferences` action 已就位（A3，写 `workshopState.consistency_references`）

### 剩余缺口（本计划要修）

1. **`workshop-store.ts` hydrate 函数漏了 `imageGenUseCharacterRef`**（lines 320-335）：
   - 状态字段已 persist 到 sessionStorage，但 hydrate 时未读回 → 刷新后开关状态丢失，回退为 DEFAULT_STATE 的 false。
   - 影响：用户勾选后刷新页面，开关会重置为关闭。

2. **`WorkshopPage.tsx` `execImageGen` 未传 `reference_image_path`**（lines 196-233）：
   - `generateImage.mutateAsync({...})` 调用只传 prompt/negative_prompt/size/n，未传参考图。
   - 影响：即使开关打开、第 3 步已生成人物图，第 7 步出图仍走纯文生图，B1 联动不生效。

3. **`WorkshopStepDetail.tsx` image_gen 步骤无开关 UI**（lines 103-132）：
   - 出图步骤只渲染图片画廊，用户无处开启「使用人物参考图」。
   - 项目无 shadcn `Checkbox` 组件（`components/ui/` 下无 checkbox.tsx），也不必为此引入 `@radix-ui/react-checkbox` 依赖——用原生 `<input type="checkbox">` + `<Label>` 即可，符合项目「无新依赖」的轻量约定。

---

## Assumptions & Decisions

1. **不引入新依赖**：`components/ui/` 无 checkbox 组件。用原生 `<input type="checkbox">` 配 Tailwind 样式 + `<Label>`，足够 accessible 且零成本。
2. **开关默认关闭**：图生图比文生图慢且并非所有分镜都含人物，默认关闭、用户主动开启（与原计划一致）。
3. **开关可见性**：image_gen 步骤卡片内顶部始终显示开关（pending/running/done 各状态），让用户在执行前可切换。无人物参考图时禁用并提示。
4. **参考图来源固定为人物**：`store.mediaResults.characterImage?.url`。物品/场景参考图暂不接入出图（原计划 B1 仅指人物参考图）。
5. **向后兼容**：`reference_image_path` 为可选字段，不传时后端走文生图，现有行为不变。
6. **URL 直接传递**：`characterImage.url` 形如 `/outputs/image/xxx.jpg`，后端 `_resolve_reference_image` 取 basename 后解析，直接透传即可，无需前端额外处理。

---

## Proposed Changes

### 改动 1：`workshop-store.ts` hydrate 补回 imageGenUseCharacterRef

**文件**：`qinghe-video/frontend/src/stores/workshop-store.ts`
**位置**：hydrate 函数内 `set({ ... })`（约 line 327，`currentStep` 之后）

**改动**：在 `currentStep: snapshot.currentStep ?? "planner",` 之后加一行：
```ts
imageGenUseCharacterRef: snapshot.imageGenUseCharacterRef ?? false,
```

**为什么**：persist snapshot 已写入该字段，但 hydrate 未读回，导致刷新后开关状态丢失。

---

### 改动 2：`WorkshopPage.tsx` execImageGen 传参考图

**文件**：`qinghe-video/frontend/src/pages/WorkshopPage.tsx`
**位置**：`execImageGen` 函数内（lines 196-233），`generateImage.mutateAsync` 调用处

**改动**：
1. 在函数开头（`const prompts = ...` 之后）计算参考图路径：
```ts
const characterRefUrl =
  store.imageGenUseCharacterRef
    ? store.mediaResults.characterImage?.url ?? null
    : null;
```

2. 在 `generateImage.mutateAsync({...})` 调用中条件展开参考图字段：
```ts
const resp = await generateImage.mutateAsync({
  prompt: prompts[i].prompt,
  negative_prompt: prompts[i].negative_prompt,
  size: "1920x1920",
  n: 1,
  ...(characterRefUrl ? { reference_image_path: characterRefUrl } : {}),
});
```

**为什么**：这是 B1 联动的核心——把第 3 步的人物参考图透传给后端 `generate_image()`，触发图生图 payload。条件展开保证不传时向后兼容。

---

### 改动 3：`WorkshopStepDetail.tsx` image_gen 步骤加开关 UI

**文件**：`qinghe-video/frontend/src/components/workshop/WorkshopStepDetail.tsx`
**位置**：`WorkshopStepContent` 函数内，`step === "consistency_images"` 早返回之后、通用 return 之前

**改动**：
1. 顶部 import 加 `useWorkshopStore`：
```ts
import { useWorkshopStore } from "@/stores/workshop-store";
```

2. 在 `WorkshopStepContent` 中，`consistency_images` 分支之后新增 `image_gen` 分支，顶部渲染开关，下方走原 status 分支逻辑：
```tsx
// 出图步骤：顶部显示人物参考图开关
if (step === "image_gen") {
  return (
    <div className="min-h-[80px]">
      {errorMsg && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle size={12} className="mr-1 inline" />
          {errorMsg}
        </div>
      )}
      <ImageGenRefToggle />
      {status === "running" && <DetailSkeleton />}
      {status === "done" && (
        <DetailContent step={step} output={output} mediaResults={mediaResults} />
      )}
      {(status === "pending" || status === "error") && !errorMsg && (
        <p className="py-4 text-center text-xs text-ink-faint">
          {status === "error" ? "步骤执行失败，可点击重试" : "等待执行"}
        </p>
      )}
    </div>
  );
}
```

3. 在文件底部（`DetailContent` 之后）新增 `ImageGenRefToggle` 子组件：
```tsx
function ImageGenRefToggle() {
  const checked = useWorkshopStore((s) => s.imageGenUseCharacterRef);
  const setChecked = useWorkshopStore((s) => s.setImageGenUseCharacterRef);
  const hasCharacterImage = useWorkshopStore(
    (s) => s.mediaResults.characterImage?.status === "done",
  );
  return (
    <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        disabled={!hasCharacterImage}
        className="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
      />
      <span>使用人物参考图（图生图）</span>
      {!hasCharacterImage && (
        <span className="text-ink-faint">— 请先在第 3 步生成人物一致性图</span>
      )}
    </label>
  );
}
```

**为什么**：
- 开关放在 image_gen 卡片顶部，各状态都可见，用户可在执行前切换。
- 未生成人物参考图时禁用并提示，避免无效勾选。
- 用 zustand selector 精准订阅，避免无关重渲染。
- 原生 checkbox + label，零新依赖，accessible。

---

## Verification Steps

1. **前端类型检查**：
   ```bash
   cd qinghe-video/frontend && npx tsc --noEmit
   ```
   预期：0 error。

2. **后端测试回归**（确认 B1 后端改动未破坏现有测试）：
   ```bash
   cd qinghe-video && pytest tests/ -v
   ```
   预期：所有测试通过（含此前新增的 visual_designer 一致性参考注入测试 + 3 个模板段落测试）。

3. **手动 E2E（需 API key，可选）**：
   - 启动 `.\run.ps1`，登录，进工坊
   - 第 3 步：生成人物一致性图（确认 `characterImage` done）
   - 第 7 步：确认开关可见且可勾选（无人物图时禁用）
   - 勾选后出图 → 确认走图生图（耗时增加），分镜人物外观与第 3 步一致
   - 取消勾选 → 确认走文生图（向后兼容）
   - 勾选后刷新页面 → 确认开关状态保留（hydrate 生效）
