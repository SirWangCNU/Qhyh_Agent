# 分步工坊卡片网格化重构计划

## 摘要

将「分步工坊」页面从现有的「垂直堆叠卡片 + 步骤列表 + 右侧详情面板」结构，改造成参考漫剧 UI 的「所有 Step 以卡片网格平铺」布局。主题色（农业绿/麦穗金/米白纸张风）完全保留，仅借鉴参考图的 Step 摆放位置与卡片交互形态。

核心变化：
- 8 个步骤全部以独立卡片形式平铺展示。
- 创意输入表单（产品名 + 一句话创意 + AI 润写）移入 Step 1「策划」卡片内。
- 顶部保留极简进度条与全局操作按钮。
- 步骤详情由各卡片内部承载，不再使用右侧独立详情面板。

---

## 当前状态分析

### 文件结构
- **入口页面**：`qinghe-video/frontend/src/pages/WorkshopPage.tsx`
  - 当前为垂直 5 段式布局：头部标题 → 创意输入卡片 → 进度条卡片 → 步骤列表卡片 → 步骤详情卡片。
  - 所有业务编排逻辑（自动执行、重试、AI 润写、步骤分发）集中在此。
- **步骤列表**：`qinghe-video/frontend/src/components/workshop/WorkshopStepList.tsx`
  - 以行式列表渲染 `WORKSHOP_STEPS`，每行包含 checkbox、emoji 图标、标题、状态、重试按钮。
  - 点击行仅切换 `currentStep`，详情在右侧独立面板展示。
- **步骤详情**：`qinghe-video/frontend/src/components/workshop/WorkshopStepDetail.tsx`
  - 根据 `currentStep` 展示 LLM 输出 / 图片画廊 / 音频 / 视频。
  - 当前为独立大卡片，通过 `framer-motion` 切换动画。
- **进度条**：`qinghe-video/frontend/src/components/workshop/WorkshopProgressBar.tsx`
  - 计算完成百分比，展示圆角进度条 + 状态文字。
- **状态管理**：`qinghe-video/frontend/src/stores/workshop-store.ts`
  - Zustand + `sessionStorage` 持久化，包含步骤状态、输出、当前步骤、表单、自动执行位点等。
  - 状态形状稳定，无需改动。
- **常量配置**：`qinghe-video/frontend/src/lib/constants.ts`
  - 定义 `WORKSHOP_STEPS` 8 步顺序、依赖、类型。

### 主题与样式
- 颜色来自 `index.css` CSS 变量：`--color-bg` `#f5f1e8`、 `--color-brand` `#3d5a3d`、 `--color-accent` `#c9a961` 等。
- Tailwind 同时支持 `primary`/`secondary`/`success`/`destructive` 等语义类。
- 字体：`font-display`（Fraunces / 宋体）用于标题，`font-body`（DM Sans / 系统无衬线）用于正文。

### 可复用部分
- `workshop-store.ts` 状态与 API 动作完全复用。
- `lib/constants.ts` 的 `WORKSHOP_STEPS` 顺序与元数据复用。
- API hooks（`use-agents.ts`、`use-text-polish.ts`、`use-media.ts`）调用方式复用。
- `AgentOutputView` 组件仍用于渲染 LLM 步骤输出。
- 主题色、字体、圆角、阴影保持不变。

---

## 拟议改动

### 1. 调整页面布局：`WorkshopPage.tsx`

**做什么**：
- 移除当前垂直堆叠的 5 个区域中的「创意输入」「步骤列表」「步骤详情」独立卡片。
- 保留页面头部标题区，但简化。
- 顶部保留全局进度条（更紧凑）和全局操作按钮（开始执行 / 重置）。
- 主体改为卡片网格容器，渲染新的步骤列表组件。

**怎么做**：
- 用 `grid grid-cols-1 md:grid-cols-2 gap-5` 作为外层。
- 将 `WorkshopStepList` 替换为新的卡片网格组件。
- 全局按钮固定放在页面右上角或进度条右侧。
- 保持所有业务逻辑（`startAutoRun`、`executeStep`、`retryStep`、`handlePolish`）不变。

**为什么**：
- 这是从「列表+详情」到「卡片网格」的核心结构切换。
- 保持业务逻辑不动，降低回归风险。

---

### 2. 重构步骤列表为网格容器：`WorkshopStepList.tsx`

**做什么**：
- 将行式列表改造成卡片网格的容器。
- 决定每个步骤在网格中的占位：
  - Step 1 策划（含输入表单）：`col-span-1`
  - Step 2 文案：`col-span-1`
  - Step 3 脚本：`col-span-2`（内容较长，全宽展示更舒适）
  - Step 4 视觉：`col-span-1`
  - Step 5 投放：`col-span-1`
  - Step 6 出图：`col-span-1`
  - Step 7 配音：`col-span-1`
  - Step 8 合成：`col-span-2`（视频预览需要更宽空间）

**怎么做**：
- 内部不再直接渲染行 DOM，而是遍历 `WORKSHOP_STEPS` 并渲染 `<WorkshopStepCard>`。
- 通过步骤 `key` 映射 `gridSpan`（可在 `lib/constants.ts` 增加字段，也可在组件内用映射表）。
- 将 `onStepClick`、`onStepRun`、`onStepRetry`、`autoRunToStep` 等回调透传给卡片。

**为什么**：
- 参考漫剧 UI 的 Step 摆放：前两个 Step 并排、中间有全宽 Step、后续再并排。
- 脚本和视频步骤内容多，全宽更合理。

---

### 3. 新增步骤卡片组件：`WorkshopStepCard.tsx`

**做什么**：
- 创建一个统一的步骤卡片组件，每张卡承载一个 Step 的所有内容。
- 卡片结构：
  - **Header**：左侧圆形步骤指示器（radio 样式 / 状态图标）+ 步骤序号 + 中文标题 + 英文 kicker + 状态徽标（进行中/完成/错误/等待）。
  - **Body**：根据步骤类型渲染不同内容：
    - `planner`：创意输入表单（产品名、一句话创意、AI 润写按钮）。
    - `copywriter` / `scriptwriter` / `visual_designer` / `distributor`：LLM 输出摘要，支持展开查看完整内容（复用 `AgentOutputView`）。
    - `image_gen`：图片画廊（2×2 或横向滚动）。
    - `tts`：音频播放器 + 下载链接。
    - `compose`：视频播放器 + 下载按钮。
  - **Footer**：该步骤的操作按钮（运行此步 / 重试 / 查看下一步提示）。

**怎么做**：
- Props 接收 `step` 配置、`status`、`output`、`error`、`isCurrent`、`isAutoRunTarget`、`onRun`、`onRetry`、`onClick`。
- 使用现有 `Button`、`Input`、`Textarea`、`Label` 等 shadcn/ui 组件。
- 未满足依赖时卡片显示 `disabled` 遮罩或降低透明度，并在 footer 提示「需先完成 Step X」。
- 运行中卡片顶部显示进度/loading 指示。

**为什么**：
- 每个 Step 成为独立可操作的单元，与参考图的卡片交互一致。
- 将原本独立的输入表单与详情面板内容下沉到对应卡片，减少页面层级跳转。

---

### 4. 改造步骤详情为内联渲染器：`WorkshopStepDetail.tsx`

**做什么**：
- 不再作为独立详情面板存在，而是改写成可被 `WorkshopStepCard` 调用的内容渲染器。
- 保留内容类型分发逻辑（LLM / 图片 / 音频 / 视频）。

**怎么做**：
- 导出 `WorkshopStepContent({ stepKey, output, error })` 函数组件。
- 移除 `currentStep` 依赖和 `framer-motion` 切换动画（卡片本身可负责简单过渡）。
- 图片画廊、音频、视频渲染保持现有实现，仅调整尺寸以适配卡片内部。

**为什么**：
- 避免重复实现输出渲染逻辑；让卡片专注于布局和操作，内容渲染复用现有逻辑。

---

### 5. 调整进度条：`WorkshopProgressBar.tsx`

**做什么**：
- 保持百分比计算逻辑。
- 视觉上改为更纤细的顶部进度条，可附加步骤节点小圆点。

**怎么做**：
- 高度从当前较粗改为 `h-2` 或 `h-1.5`。
- 在进度条上方或内部叠加 8 个小节点，高亮已完成/当前步骤。
- 百分比与状态文字放在进度条右侧。

**为什么**：
- 卡片网格本身已经展示步骤，进度条不需要再占大块空间；顶部轻量提示即可。

---

### 6. 常量扩展：`lib/constants.ts`

**做什么**：
- 为 `WORKSHOP_STEPS` 增加卡片网格所需的辅助字段。

**怎么做**：
- 增加 `gridSpan: 1 | 2` 字段，控制卡片在网格中的跨度。
- 增加 `description?: string` 字段，用于卡片内副标题提示。
- 保持现有 `key`、`title`、`type`、`deps`、`defaultAuto` 不变。

**为什么**：
- 将布局元数据与业务配置集中管理，便于后续调整。

---

## 假设与决策

1. **布局决策**：采用「卡片网格平铺」，前两个 Step 并排、中间脚本 Step 全宽、后续成对并排、最终合成视频全宽。
2. **输入位置**：创意输入表单移入 Step 1「策划」卡片内部，符合参考图 Step 1 承载输入的设计。
3. **主题不变**：继续使用现有农业风配色（`--color-brand` 绿、`--color-accent` 金、`--color-bg` 米白），不切换为参考图的深色主题。
4. **状态管理不变**：复用 `workshop-store.ts`，不引入新的状态层。
5. **响应式**：桌面端两列网格，移动端单列堆叠。
6. **交互不变**：自动执行到第 N 步、依赖校验、错误重试等逻辑保留，仅改变触发按钮的位置（在卡片 footer）。

---

## 验证步骤

1. **启动验证**：
   - 在 `qinghe-video/frontend` 执行 `npm run dev`。
   - 浏览器访问 `http://localhost:5173/#/workshop`。

2. **视觉验证**：
   - 页面顶部显示极简进度条 + 全局操作按钮。
   - 8 个步骤以卡片网格形式展示，布局符合：Step1|Step2、Step3 全宽、Step4|Step5、Step6|Step7、Step8 全宽。
   - Step 1 卡片内包含产品名输入、一句话创意输入、AI 润写按钮。
   - 主题色仍为农业绿/金/米白。

3. **功能验证**：
   - 填写 Step 1 表单并点击「AI 润写」，表单被补全。
   - 点击「开始执行」，步骤按顺序运行，卡片状态从 pending → running → done 更新。
   - 步骤完成后，卡片 body 显示对应输出（文案/脚本/图片/音频/视频）。
   - 点击「重置」清空所有步骤状态与表单。
   - 切换浏览器宽度，网格在移动端自动变为单列。

4. **构建验证**：
   - 执行 `npm run build`，确认无 TypeScript 错误与 Tailwind 类名警告。

---

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `qinghe-video/frontend/src/pages/WorkshopPage.tsx` | 修改 | 改为卡片网格布局，保留业务逻辑 |
| `qinghe-video/frontend/src/components/workshop/WorkshopStepList.tsx` | 修改 | 从列表改为网格容器 |
| `qinghe-video/frontend/src/components/workshop/WorkshopStepCard.tsx` | 新增 | 统一的步骤卡片组件 |
| `qinghe-video/frontend/src/components/workshop/WorkshopStepDetail.tsx` | 修改 | 改为卡片内联内容渲染器 |
| `qinghe-video/frontend/src/components/workshop/WorkshopProgressBar.tsx` | 修改 | 改为顶部极简进度条 |
| `qinghe-video/frontend/src/lib/constants.ts` | 修改 | 增加 `gridSpan`、`description` 字段 |
