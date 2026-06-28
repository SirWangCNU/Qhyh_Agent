# 分步工坊改造计划：Auto Video Agent 模式分步触发流程（React 版）

## 一、调研结论

### 1.1 市场参考模式（Auto Video Agent）
核心交互模式：
- **步骤勾选控制**：每步前有复选框，用户勾选"自动化到此步"，系统自动顺序执行到勾选的最后一步
- **进度可视化**：顶部进度条 + 百分比，步骤列表实时显示"等待中/生成中/完成/失败"
- **混合执行**：默认自动跑到内容策划完成，后续出图/配音/合成可手动点「下一步」逐步触发
- **错误处理**：每步失败独立显示，不阻塞其他步骤重试
- **前置依赖校验**：执行前校验前置步骤是否完成

### 1.2 重构后的前端架构现状

前端已完全重构为 **React + TypeScript + Vite + Tailwind + shadcn/ui** 架构：

| 技术栈 | 说明 |
|--------|------|
| React 18 + TypeScript | 函数组件 + Hooks |
| Vite | 构建工具 |
| Tailwind CSS + shadcn/ui | 样式系统 |
| Zustand | 全局状态（[pipeline-store.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/stores/pipeline-store.ts) 等） |
| TanStack React Query | 数据请求（useMutation hooks） |
| Framer Motion | 动画 |

**关键发现：所有需要的 API hooks 已经存在！**

| Hook | 用途 | 所在文件 |
|------|------|----------|
| `useRunAgentStep()` | 单步执行 6 个 LLM Agent | [use-agents.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/hooks/use-agents.ts) |
| `useGenerateImage()` | 图片生成 | [use-media.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/hooks/use-media.ts) |
| `useGenerateTTS()` | TTS 配音（**已存在但 WorkshopPage 未使用！**） | [use-media.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/hooks/use-media.ts) |
| `useComposeVideo()` | 视频合成（**已存在但 WorkshopPage 用 useVideoMvp 替代**） | [use-media.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/hooks/use-media.ts) |
| `useVideoMvp()` | 一键成片（黑盒：出图→TTS→合成） | [use-media.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/hooks/use-media.ts) |

**现有 WorkshopPage 的问题**（[WorkshopPage.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/pages/WorkshopPage.tsx)）：
- 布局：左侧 6 步 rail + 右侧 stage（表单 + 输出 + 素材区）
- 状态全在组件内 `useState`，**无持久化**（刷新/路由切换丢失）
- 只能单步手动执行，无自动批量执行
- 无进度条、无复选框、无"下一步"按钮
- 素材生成区独立于步骤流，"一键成片"是黑盒调用 `useVideoMvp`
- **未使用 `useGenerateTTS` 和 `useComposeVideo`**，无法分步控制媒体生成

**现有可复用基础设施**：
- [pipeline-store.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/stores/pipeline-store.ts) — Zustand + sessionStorage 持久化模式（但只支持 6 个 LLM 节点，用于 SSE 流）
- [PipelineFlow.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/pipeline/PipelineFlow.tsx) + [PipelineNode.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/pipeline/PipelineNode.tsx) — 流水线可视化组件（用于侧边栏）
- [AgentOutputView.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/agent/AgentOutputView.tsx) — Agent 输出渲染器（6 种 Agent 类型）
- [constants.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/lib/constants.ts) — `NODE_ORDER`（6 个 LLM 节点）、`NODE_META`、`STORAGE_KEYS`
- [types/api.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/types/api.ts) — 所有类型定义已就绪（`TTSRequest/Response`、`VideoComposeRequest/Response` 等）

---

## 二、流水线步骤设计

将 5 个 LLM Agent + 图片生成 + TTS + 视频合成合并为统一的 **8 步农事工序**：

| 序号 | Key | 名称 | 依赖步骤 | 执行类型 | 默认自动 | API Hook |
|------|-----|------|----------|----------|----------|----------|
| 1 | `planner` | 策划 | 表单输入 | LLM Agent | ☑ | `useRunAgentStep` |
| 2 | `copywriter` | 文案 | 策划 | LLM Agent | ☑ | `useRunAgentStep` |
| 3 | `scriptwriter` | 脚本 | 文案 | LLM Agent | ☑ | `useRunAgentStep` |
| 4 | `visual_designer` | 视觉 | 脚本 | LLM Agent | ☑ | `useRunAgentStep` |
| 5 | `distributor` | 投放 | 视觉 | LLM Agent | ☐ | `useRunAgentStep` |
| 6 | `image_gen` | 出图 | 视觉 | 图片API | ☐ | `useGenerateImage` |
| 7 | `tts` | 配音 | 文案 | TTS API | ☐ | `useGenerateTTS` |
| 8 | `compose` | 合成 | 出图+配音 | 本地合成 | ☐ | `useComposeVideo` |

> 说明：
> - 默认自动执行到步骤 4（视觉 Prompt 完成），之后媒体生成涉及成本/时间，用户检查后手动续跑
> - 步骤 6（出图）和步骤 7（配音）无相互依赖，但 UI 保持线性顺序以清晰展示进度
> - 步骤 8（合成）必须等出图和配音都完成
> - **报告（report_generator）** 在合成完成后自动触发（非手动步骤），调用 `useRunAgentStep` 生成汇总 markdown
> - **不再使用 `useVideoMvp` 黑盒**，改为分步调用 `useGenerateImage` → `useGenerateTTS` → `useComposeVideo`，实现真正的分步可控

---

## 三、UI/UX 设计方案

### 3.1 布局改造

参照 Auto Video Agent 模式，将现有左右布局改为**垂直流程布局**：

```
┌──────────────────────────────────────────────────────────┐
│  产品信息表单（产品名、产地、品类、卖点、平台、时长）       │  ← 表单区（保留现有）
├──────────────────────────────────────────────────────────┤
│  ████████████████░░░░░░░░░░░░░░  50%  策划→文案→脚本→视觉  │  ← 进度条
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ☑ 1 策划    [✓已完成]                                   │
│  ☑ 2 文案    [✓已完成]                                   │
│  ☑ 3 脚本    [⟳执行中...]                                │  ← 步骤列表
│  ☑ 4 视觉    [等待中]                                    │  （每行：复选框+序号+名称+状态+重试）
│  ☐ 5 投放    [等待中]                                    │
│  ☐ 6 出图    [等待中]                                    │
│  ☐ 7 配音    [等待中]                                    │
│  ☐ 8 合成    [等待中]                                    │
│                                                          │
│  [ 开始执行 / 下一步 ]  [ 重置 ]                         │  ← 操作按钮
├──────────────────────────────────────────────────────────┤
│  当前步骤：③ 脚本 Agent                                  │
│  ┌──────────────────────────────────────────────────┐    │
│  │  （步骤输出内容，复用 AgentOutputView）           │    │  ← 输出详情面板
│  └──────────────────────────────────────────────────┘    │
│  （步骤6/7/8时显示图片画廊/音频播放器/视频播放器）         │
└──────────────────────────────────────────────────────────┘
```

### 3.2 步骤状态
每个步骤有 5 种状态：
- **pending（等待中）**：灰色，未开始
- **ready（就绪）**：前置已完成，可执行
- **running（执行中）**：品牌色 + 加载动画
- **done（已完成）**：绿色 ✓
- **error（失败）**：红色 ✗ + 错误信息 + 重试按钮

### 3.3 交互流程
1. **初始状态**：填写表单 → 勾选自动执行到哪步（默认到步骤4）→ 点「开始执行」
2. **自动执行**：系统按顺序执行勾选步骤，进度条实时更新，步骤状态联动
3. **自动暂停**：执行完最后一个勾选步骤后暂停，主按钮变为「下一步」
4. **手动续跑**：点「下一步」执行下一个未完成步骤，或勾选更多复选框后点「继续自动执行」
5. **查看输出**：点击任意已完成步骤查看其输出
6. **错误处理**：某步失败时标红 + 显示错误 + 提供「重试」按钮，后续步骤暂停
7. **步骤跳转**：已完成步骤可点击查看，未就绪步骤不可点击

---

## 四、技术实现方案

### 4.1 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/lib/constants.ts` | **新增** | 增加 `WORKSHOP_STEPS` 配置（8步定义） |
| `frontend/src/stores/workshop-store.ts` | **新建** | Zustand store，8步状态管理 + sessionStorage 持久化 |
| `frontend/src/pages/WorkshopPage.tsx` | **重写** | Auto Video Agent 流程 UI |
| `frontend/src/components/workshop/WorkshopStepList.tsx` | **新建** | 步骤列表组件（复选框+状态+重试） |
| `frontend/src/components/workshop/WorkshopProgressBar.tsx` | **新建** | 进度条组件 |
| `frontend/src/components/workshop/WorkshopStepDetail.tsx` | **新建** | 步骤输出/媒体详情面板 |
| `frontend/src/App.tsx` | **小改** | 启动时 hydrate workshop-store |
| **后端** | **无改动** | 所有 API 已就绪 |

### 4.2 常量定义（constants.ts 新增）

```typescript
/** 工坊步骤类型（扩展自 NodeKey，增加媒体步骤） */
export type WorkshopStepKey =
  | NodeKey
  | "image_gen"
  | "tts"
  | "compose";

/** 工坊步骤类型 */
export type WorkshopStepType = "llm" | "image" | "tts" | "compose";

/** 工坊步骤配置 */
export interface WorkshopStepConfig {
  key: WorkshopStepKey;
  num: number;
  title: string;
  emoji: string;
  kicker: string;
  desc: string;
  type: WorkshopStepType;
  deps: WorkshopStepKey[];
  defaultAuto: boolean; // 默认是否勾选自动执行
}

/** 8 步工坊流水线定义 */
export const WORKSHOP_STEPS: WorkshopStepConfig[] = [
  { key: "planner", num: 1, title: "策划", emoji: "📋", kicker: "PLANNER", desc: "主题、受众、卖点", type: "llm", deps: [], defaultAuto: true },
  { key: "copywriter", num: 2, title: "文案", emoji: "✍️", kicker: "COPYWRITER", desc: "Hook、口播、CTA", type: "llm", deps: ["planner"], defaultAuto: true },
  { key: "scriptwriter", num: 3, title: "脚本", emoji: "🎬", kicker: "SCRIPTWRITER", desc: "分镜、运镜、BGM", type: "llm", deps: ["copywriter"], defaultAuto: true },
  { key: "visual_designer", num: 4, title: "视觉", emoji: "🎨", kicker: "VISUAL", desc: "图片/视频 Prompt", type: "llm", deps: ["scriptwriter"], defaultAuto: true },
  { key: "distributor", num: 5, title: "投放", emoji: "📣", kicker: "DISTRIBUTOR", desc: "标题、标签、策略", type: "llm", deps: ["visual_designer"], defaultAuto: false },
  { key: "image_gen", num: 6, title: "出图", emoji: "🖼️", kicker: "IMAGE GEN", desc: "逐镜生成图片素材", type: "image", deps: ["visual_designer"], defaultAuto: false },
  { key: "tts", num: 7, title: "配音", emoji: "🔊", kicker: "TTS", desc: "合成旁白语音", type: "tts", deps: ["copywriter"], defaultAuto: false },
  { key: "compose", num: 8, title: "合成", emoji: "🎞️", kicker: "COMPOSE", desc: "图片+配音→竖屏视频", type: "compose", deps: ["image_gen", "tts"], defaultAuto: false },
];

/** 工坊状态持久化 sessionStorage key */
// STORAGE_KEYS.workshop = "qinghe_workshop_state"  // 在 STORAGE_KEYS 中新增
```

### 4.3 Zustand Store（workshop-store.ts 新建）

```typescript
interface WorkshopState {
  // 步骤状态
  steps: Record<WorkshopStepKey, "pending" | "running" | "done" | "error">;
  stepOutputs: Record<string, unknown>;        // 每步输出数据
  stepErrors: Record<string, string>;          // 每步错误信息
  
  // 全局累积状态（LLM Agent 产出）
  workshopState: GenerateResult;
  
  // 媒体结果
  mediaResults: {
    images: Array<{ url: string; prompt: string; status: "loading" | "done" | "error" }>;
    audioUrl: string | null;
    audioPath: string | null;   // 服务端路径，给 compose 用
    videoUrl: string | null;
  };
  
  // 执行控制
  autoRunToStep: number;         // 自动执行到第几步（默认 4）
  currentStep: WorkshopStepKey | null;
  isAutoRunning: boolean;        // 是否正在自动执行
  isStepRunning: boolean;        // 是否有步骤正在执行
  
  // 表单
  form: UserInput;
  
  // 动作
  setStepStatus: (key, status) => void;
  setStepOutput: (key, output) => void;
  setStepError: (key, error) => void;
  setWorkshopState: (state) => void;
  setMediaResults: (results) => void;
  setAutoRunToStep: (step) => void;
  setCurrentStep: (key) => void;
  setForm: (form) => void;
  reset: () => void;
  hydrate: () => void;
  // persist() 内部调用，每次状态变更写 sessionStorage
}
```

### 4.4 WorkshopPage 重写架构

```typescript
export function WorkshopPage() {
  const store = useWorkshopStore();
  
  // API hooks（全部已存在）
  const runAgentStep = useRunAgentStep();
  const generateImage = useGenerateImage();
  const generateTTS = useGenerateTTS();
  const composeVideo = useComposeVideo();
  
  // 核心执行函数：根据步骤类型调用对应 API
  async function executeStep(key: WorkshopStepKey) {
    // 1. 校验前置依赖
    // 2. 设置步骤状态为 running
    // 3. 根据 step.type 调用对应 API：
    //    - llm: runAgentStep.mutateAsync({ step, input: form, state: workshopState })
    //    - image: 逐张调用 generateImage.mutateAsync()
    //    - tts: 从 workshopState.copywriter_output.full_script 提取文本 → generateTTS.mutateAsync()
    //    - compose: 用 mediaResults.images + mediaResults.audioPath → composeVideo.mutateAsync()
    // 4. 成功 → setStepStatus(done), setStepOutput, 更新 workshopState/mediaResults
    // 5. 失败 → setStepStatus(error), setStepError
    // 6. persist 到 sessionStorage
  }
  
  // 自动执行：从第一个未完成步骤执行到 autoRunToStep
  async function startAutoRun() {
    // 校验表单 → 循环执行步骤到 autoRunToStep → 暂停
  }
  
  // 手动下一步：执行下一个未完成步骤
  async function runNextStep() { ... }
  
  // 重试失败步骤
  async function retryStep(key) { ... }
  
  return (
    <section>
      {/* 1. 产品信息表单 */}
      <ProductForm form={store.form} onChange={store.setForm} />
      
      {/* 2. 进度条 */}
      <WorkshopProgressBar />
      
      {/* 3. 步骤列表 + 复选框 + 操作按钮 */}
      <WorkshopStepList
        steps={WORKSHOP_STEPS}
        stepStates={store.steps}
        autoRunToStep={store.autoRunToStep}
        onToggleAutoRun={store.setAutoRunToStep}
        onStepClick={handleStepClick}
        onRetry={retryStep}
      />
      
      {/* 操作按钮 */}
      <div>
        <Button onClick={startAutoRun}>开始执行</Button>
        <Button onClick={runNextStep}>下一步</Button>
        <Button variant="ghost" onClick={store.reset}>重置</Button>
      </div>
      
      {/* 4. 当前步骤详情 */}
      <WorkshopStepDetail
        step={store.currentStep}
        output={store.stepOutputs[store.currentStep]}
        mediaResults={store.mediaResults}
      />
    </section>
  );
}
```

### 4.5 各步骤 API 调用详解

**LLM 步骤（1-5）：**
```typescript
const resp = await runAgentStep.mutateAsync({
  step: key as NodeKey,
  input: form,
  state: workshopState,
});
// resp.state 包含累积的 GenerateResult
// resp.output 是当前步骤的输出
store.setStepOutput(key, resp.output);
store.setWorkshopState(resp.state);
```

**出图步骤（6）：**
```typescript
const shotPrompts = workshopState.visual_output?.shot_prompts ?? [];
const prompts = shotPrompts.slice(0, 4);
// 逐张生成（保持与现有 handleGenerateImages 相同逻辑）
const images = [];
for (const p of prompts) {
  const resp = await generateImage.mutateAsync({
    prompt: p.prompt,
    negative_prompt: p.negative_prompt,
    size: "1920x1920",
    n: 1,
  });
  images.push({ url: resp.images[0]?.url ?? "", prompt: p.prompt, status: "done" });
}
store.setMediaResults({ images });
```

**配音步骤（7）：**
```typescript
// 从 copywriter_output 提取旁白文本
const text = workshopState.copywriter_output?.full_script
  ?? extractFromBody(workshopState.copywriter_output?.body);
const resp = await generateTTS.mutateAsync({ text });
// resp.audio_path 是服务端路径（给 compose 用）
// resp.audio_url 是可访问 URL（给前端播放用）
store.setMediaResults({ audioUrl: resp.audio_url, audioPath: resp.audio_path });
```

**合成步骤（8）：**
```typescript
const imageUrls = mediaResults.images.map(i => i.url).filter(Boolean);
const audioPath = mediaResults.audioPath;
const resp = await composeVideo.mutateAsync({
  image_urls: imageUrls,
  audio_path: audioPath,
});
store.setMediaResults({ videoUrl: resp.video_url });

// 合成完成后自动生成报告
await runAgentStep.mutateAsync({
  step: "report_generator",
  input: form,
  state: workshopState,
});
```

---

## 五、组件设计

### 5.1 WorkshopStepList.tsx
```typescript
interface WorkshopStepListProps {
  steps: WorkshopStepConfig[];
  stepStates: Record<WorkshopStepKey, StepStatus>;
  autoRunToStep: number;
  currentStep: WorkshopStepKey | null;
  onToggleAutoRun: (step: number) => void;
  onStepClick: (key: WorkshopStepKey) => void;
  onRetry: (key: WorkshopStepKey) => void;
}
// 渲染：每步一行 = [复选框] [序号] [emoji+名称] [状态徽章] [重试按钮(仅error)]
// 复选框：勾选表示"自动执行到此步"，勾选N时1~N全部自动勾选
// 点击步骤行：已完成→查看输出；就绪→设为当前步骤；未就绪→不可点击
```

### 5.2 WorkshopProgressBar.tsx
```typescript
// 顶部进度条：计算 done/total 百分比 + 当前执行状态文字
// 使用 Framer Motion 动画（复用 PipelineFlow.tsx 中的 motion.div 模式）
```

### 5.3 WorkshopStepDetail.tsx
```typescript
interface WorkshopStepDetailProps {
  step: WorkshopStepKey | null;
  output: unknown;
  mediaResults: MediaResults;
}
// LLM 步骤：复用 <AgentOutputView step={step} output={output} />
// image_gen 步骤：渲染图片画廊（grid 2x2 或 4 列）
// tts 步骤：渲染 <audio> 播放器 + 旁白文本预览
// compose 步骤：渲染 <video> 播放器 + 下载按钮
```

---

## 六、状态持久化

使用 `sessionStorage`（key: `qinghe_workshop_state`），在 `workshop-store.ts` 的 `persist()` 函数中自动写入：

```typescript
function persist(state: WorkshopState) {
  const snapshot = {
    steps: state.steps,
    stepOutputs: state.stepOutputs,
    workshopState: state.workshopState,
    mediaResults: state.mediaResults,
    autoRunToStep: state.autoRunToStep,
    currentStep: state.currentStep,
    form: state.form,
  };
  sessionStorage.setItem(STORAGE_KEYS.workshop, JSON.stringify(snapshot));
}
```

- 每次状态变更（setStepStatus / setStepOutput / setMediaResults 等）后自动调用 `persist()`
- `App.tsx` 启动时调用 `useWorkshopStore.getState().hydrate()` 恢复
- 「重置」按钮清空 sessionStorage 并重置所有状态

---

## 七、风险与注意事项

1. **不复用 pipeline-store**：现有 `pipeline-store` 绑定 SSE 流式生成（6个LLM节点），用于侧边栏进度展示。工坊需要 8 步含媒体步骤，状态语义不同，新建独立 `workshop-store` 避免污染
2. **不再使用 useVideoMvp**：改为分步调用 image→tts→compose，实现真正的分步可控。`useVideoMvp` 保留给对话创作页（ChatPage）使用
3. **文件行数控制**：WorkshopPage 重写后可能较长，拆分为 3 个子组件（StepList / ProgressBar / StepDetail）控制每个文件 < 300 行
4. **图片生成失败处理**：出图可能部分失败，需要支持单张重试（复用现有 generatedImages 状态模式）
5. **TTS 文本提取**：需从 `copywriter_output` 提取旁白，逻辑参考后端 [video_mvp.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/video_mvp.py) 的 `_extract_voiceover_text` 函数
6. **向后兼容**：WorkshopPage 是独立页面，不影响 ChatPage / CreatePage 等其他页面

---

## 八、实现步骤（执行顺序）

1. **constants.ts**：新增 `WorkshopStepKey`、`WorkshopStepConfig`、`WORKSHOP_STEPS`、`STORAGE_KEYS.workshop`
2. **workshop-store.ts**：新建 Zustand store，8步状态管理 + sessionStorage 持久化
3. **App.tsx**：启动时 hydrate workshop-store
4. **WorkshopStepList.tsx**：步骤列表组件（复选框+状态+重试）
5. **WorkshopProgressBar.tsx**：进度条组件
6. **WorkshopStepDetail.tsx**：步骤输出/媒体详情面板
7. **WorkshopPage.tsx**：重写主页面，编排 8 步执行逻辑
8. **测试验证**：启动前端 dev server 测试完整流程
