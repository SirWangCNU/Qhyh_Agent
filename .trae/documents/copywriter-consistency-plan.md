# 文案 Agent 输出一致性规划并自动填充第 3 步计划

## Summary

当前文案 Agent（copywriter）只输出口播文案（hook/body/cta/full_script），第 3 步一致性生图的人物/物品/场景主体描述需要用户手动填写或点击「从策划填充」才能生成。

本计划让文案 Agent 在撰写口播文案的同时，额外输出一段「一致性视觉规划」（character / object / scene 的主体描述 + 统一风格偏好），并在文案步骤完成后自动填充到第 3 步一致性生图的三个卡片中。这样用户只需在 Step 1 选题 → Step 2 文案生成后，第 3 步直接沿用文案规划的描述点击「全部生成」即可，无需手动构思主体描述。

## Current State Analysis

### 后端

- **文案系统提示词**：`src/prompts/copywriter.txt`
  - 当前输出格式只包含 hook/body/cta/full_script/estimated_duration_seconds/word_count
  - 未要求输出人物/物品/场景规划
- **文案输出模型**：`src/models.py::CopywriterOutput`（`ConfigDict(extra="forbid")`）
  - 当前字段：hook、body、cta、full_script、estimated_duration_seconds、word_count
  - 新增字段需同步修改模型、提示词、前端类型
- **文案节点**：`src/nodes/copywriter.py`
  - 读取 planner_output，可选 selected_topic，调用 LLM 生成 CopywriterOutput
  - 返回 `{"copywriter_output": result.model_dump()}`
- **一致性生图 prompt 构造器**：`src/consistency_images/prompt_builder.py`
  - 使用 `{subject}` 和 `{style_preference}` 占位符填充 3 个 .md 模板
  - 无需改动

### 前端

- **文案类型**：`frontend/src/types/api.ts::CopywriterOutput`
  - 需新增 `consistency_plan?: ConsistencyPlan`
- **工坊 Store**：`frontend/src/stores/workshop-store.ts`
  - 已存在 `setConsistencyReferences(type, subject)` 用于把主体描述写入 `workshopState.consistency_references`
  - 新增 action 可把 copywriter 输出的一致性规划同步到卡片状态（或复用现有 store）
- **一致性生图面板**：`frontend/src/components/workshop/ConsistencyImagesPanel.tsx`
  - 通过 `cardRefs` 命令式调用 `fillSubject(s: string)` 填充主体描述
  - 可扩展为同时填充 `stylePreference`
- **一致性生图卡片**：`frontend/src/components/workshop/ConsistencyCard.tsx`
  - `useImperativeHandle` 暴露 `fillSubject`，需新增 `fillStylePreference` 或改为 `fillFields({subject, stylePreference})`
- **工坊页面**：`frontend/src/pages/WorkshopPage.tsx`
  - `execLLMStep("copywriter")` 成功后调用 `store.setWorkshopState(resp.state)`
  - 可在此触发自动填充逻辑

## Assumptions & Decisions

1. **新增字段命名**：`consistency_plan`，类型为对象，包含：
   - `character_subject?: string`：人物主体描述
   - `object_subject?: string`：物品主体描述
   - `scene_subject?: string`：场景主体描述
   - `style_preference?: string`：统一的风格偏好（如真实棚拍、自然光、暖色调）
2. **所有字段可选**：文案 Agent 可能不总能明确区分人物/物品/场景，可选字段保证容错。
3. **不强制覆盖用户已填写内容**：自动填充只在对应卡片主体描述为空时写入，避免覆盖用户手动输入。
4. **风格偏好统一**：三个卡片共用 copywriter 生成的 `style_preference`，用户仍可在卡片内单独修改。
5. **向后兼容**：旧数据无 `consistency_plan` 字段时，第 3 步保持现有手动填写行为。
6. **同步写一致性参考**：自动填充时同步把三类主体描述写入 `workshopState.consistency_references`，供 visual_designer 注入。
7. **不改动 LLM 调用次数**：在 copywriter 原有 system prompt 中追加要求，单次调用同时输出文案和一致性规划。
8. **不新增后端路由/节点**：仅扩展 CopywriterOutput 模型和提示词，复用现有 `POST /api/agents/copywriter`。

## Proposed Changes

### 后端改动

#### 1. `src/models.py` — 扩展 CopywriterOutput

在 `CopywriterOutput` 中新增 `consistency_plan` 字段：

```python
class ConsistencyPlan(BaseModel):
    """文案 Agent 为一致性生图生成的视觉规划。"""

    model_config = ConfigDict(extra="forbid")

    character_subject: str | None = Field(
        None,
        description="人物主体描述，用于第 3 步人物一致性生图",
    )
    object_subject: str | None = Field(
        None,
        description="物品主体描述，用于第 3 步物品一致性生图",
    )
    scene_subject: str | None = Field(
        None,
        description="场景主体描述，用于第 3 步场景一致性生图",
    )
    style_preference: str | None = Field(
        None,
        description="三类一致性图的统一风格偏好，如真实棚拍、自然光、暖色调",
    )


class CopywriterOutput(BaseModel):
    """文案 Agent 输出。"""

    model_config = ConfigDict(extra="forbid")

    hook: HookSegment
    body: list[BodySegment] = Field(..., min_length=2, max_length=4)
    cta: HookSegment
    full_script: str
    estimated_duration_seconds: int
    word_count: int
    consistency_plan: ConsistencyPlan | None = Field(
        None,
        description="为后续一致性生图规划的人物/物品/场景主体描述与统一风格",
    )
```

#### 2. `src/prompts/copywriter.txt` — 追加一致性规划要求

在「输出格式」中新增 `consistency_plan` 段落，在「约束」中补充生成规则：

- 输出格式追加：

```json
{
  ...,
  "consistency_plan": {
    "character_subject": "人物主体描述，如一位 30 岁果农...",
    "object_subject": "物品主体描述，如新鲜饱满的水蜜桃...",
    "scene_subject": "场景主体描述，如清晨阳光下的桃园...",
    "style_preference": "统一风格偏好，如真实棚拍、自然光、暖色调、纪录片质感"
  }
}
```

- 约束追加：
  - `consistency_plan` 必须结合 `planner_output.theme` 和口播文案中的画面元素生成
  - 人物描述包含年龄、职业、服装、神态、外貌特征
  - 物品描述包含品类、形态、颜色、质感、关键细节
  - 场景描述包含地点、时间、光线、环境元素
  - `style_preference` 需同时适合人物/物品/场景三类一致性生图

### 前端改动

#### 3. `frontend/src/types/api.ts` — 同步类型

新增 `ConsistencyPlan` 接口并扩展到 `CopywriterOutput`：

```ts
export interface ConsistencyPlan {
  character_subject?: string;
  object_subject?: string;
  scene_subject?: string;
  style_preference?: string;
}

export interface CopywriterOutput {
  hook: HookSegment;
  body: BodySegment[];
  cta: HookSegment;
  full_script: string;
  estimated_duration_seconds: number;
  word_count: number;
  consistency_plan?: ConsistencyPlan;
}
```

#### 4. `frontend/src/components/workshop/ConsistencyCard.tsx` — 扩展命令式接口

把 `fillSubject` 扩展为 `fillFields`，支持同时填充主体描述和风格偏好：

```ts
export interface ConsistencyCardHandle {
  generate: () => Promise<boolean>;
  fillFields: (fields: { subject?: string; stylePreference?: string }) => void;
}
```

实现：

```ts
useImperativeHandle(ref, () => ({
  generate: () => generateRef.current(),
  fillFields: ({ subject, stylePreference }) => {
    if (subject !== undefined) setSubject(subject);
    if (stylePreference !== undefined) setStylePref(stylePreference);
  },
}));
```

#### 5. `frontend/src/components/workshop/ConsistencyImagesPanel.tsx` — 自动填充逻辑

新增函数 `applyConsistencyPlan(plan: ConsistencyPlan | undefined)`：

```ts
function applyConsistencyPlan(plan?: ConsistencyPlan) {
  if (!plan) return;
  if (plan.character_subject) cardRefs.current.character?.fillFields({ subject: plan.character_subject });
  if (plan.object_subject) cardRefs.current.object?.fillFields({ subject: plan.object_subject });
  if (plan.scene_subject) cardRefs.current.scene?.fillFields({ subject: plan.scene_subject });
  if (plan.style_preference) {
    CARD_TYPES.forEach((type) => {
      cardRefs.current[type]?.fillFields({ stylePreference: plan.style_preference });
    });
  }
}
```

在组件挂载时读取 `store.workshopState.copywriter_output?.consistency_plan` 执行一次填充（处理刷新后恢复）。

同时保留「从策划填充」按钮作为 fallback。

#### 6. `frontend/src/pages/WorkshopPage.tsx` — 文案完成后触发自动填充

在 `execLLMStep("copywriter")` 成功后，通过 store 把一致性规划同步写入 `workshopState.consistency_references`：

```ts
const plan = resp.state?.copywriter_output?.consistency_plan;
if (plan) {
  if (plan.character_subject) store.setConsistencyReferences("character", plan.character_subject);
  if (plan.object_subject) store.setConsistencyReferences("object", plan.object_subject);
  if (plan.scene_subject) store.setConsistencyReferences("scene", plan.scene_subject);
}
```

由于 `store.setWorkshopState(resp.state)` 已把完整 state（含 copywriter_output）写入 store，`ConsistencyImagesPanel` 内的 useEffect 监听到后会自动填充。

#### 7. `frontend/src/components/workshop/ConsistencyImagesPanel.tsx` — useEffect 监听

新增：

```ts
const consistencyPlan = useWorkshopStore(
  (s) => s.workshopState.copywriter_output?.consistency_plan,
);

useEffect(() => {
  applyConsistencyPlan(consistencyPlan);
}, [consistencyPlan]);
```

注意：只填充空字段，避免覆盖用户手动修改。

### 可选：更自动化的体验

如果希望第 3 步在文案完成后自动触发「全部生成」，可在 `WorkshopPage` 中检测到 copywriter 完成后自动调用 `executeStep("consistency_images")`。但一致性生图是 image 类型步骤，`execConsistencyImages` 当前仅校验是否至少一类已 done，并不会真正生成图片（生成在卡片内独立完成）。因此自动化触发需要把批量生成逻辑提升到 WorkshopPage，复杂度较高。**本计划保持用户手动点击「全部生成」，仅自动填充描述。**

## Verification Steps

1. **后端类型与导入检查**：
   ```bash
   cd qinghe-video && python -c "from src.models import CopywriterOutput, ConsistencyPlan; print('OK')"
   ```

2. **后端单元测试**：
   ```bash
   cd qinghe-video && pytest tests/ -v
   ```
   预期：30 个测试全部通过，CopywriterOutput 构造测试兼容新字段。

3. **前端类型检查**：
   ```bash
   cd qinghe-video/frontend && npx tsc --noEmit
   ```
   预期：0 error。

4. **Prompt 占位符检查**：
   - 确认 `copywriter.txt` 中 JSON 示例的大括号已被正确转义（通过 `config.get_system_prompt("copywriter")` 读取后会自动转义 `{{` / `}}`）。

5. **手动 E2E（需 API key）**：
   - 进入工坊，Step 1 输入产品名并 AI 选题
   - 点击「开始执行」跑完 Step 2 文案
   - 进入 Step 3 一致性生图，确认人物/物品/场景的主体描述和风格偏好已自动填入
   - 点击「全部生成」确认三类一致性图可正常生成
   - 进入 Step 5 visual_designer，确认 shot_prompts 中嵌入了文案生成的主体描述
