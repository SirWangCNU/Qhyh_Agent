# 选题功能（Topic Generation）实现方案

## Summary

在工坊（Workshop）的策划步骤之前，新增一个「AI 选题」能力：用户输入「产品名 + 一句话创意」，LLM 生成 6 个爆款候选主题供用户选择，选定后把主题回填为一句话创意并自动触发润写（polish）补全完整表单，再进入 planner。

**形态**：独立 LLM 服务（仿 [text_polish.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/text_polish.py)），不入 LangGraph，不动 state/graph/agent_steps。前端在现有 `PlannerCardBody` 内接入，不新增 workshop 步骤。

**输入**：轻量（product_name + one_liner + 可选 target_platform + count）。

---

## Current State Analysis

- 现有「润写」服务 [text_polish.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/text_polish.py) 已验证「独立 LLM 服务 + 前端编排」模式可行：模块级加载 prompt（[text_polish.py:29](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/text_polish.py#L29)）、`PolishRequest`/`PolishResult` 模型、`polish_user_input()` 函数、`POST /api/text/polish` 路由（[main.py:151-164](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py#L151-164)）。
- 工坊策划卡片 `PlannerCardBody`（[WorkshopStepCard.tsx:241-396](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/workshop/WorkshopStepCard.tsx#L241-396)）已有「产品名 + 一句话创意 + AI 润写按钮 + 详情表单」结构，是接入选题 UI 的天然位置。
- `workshop-store`（[workshop-store.ts:32-76](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/stores/workshop-store.ts#L32-76)）已有 `form`、`oneLiner`、`setForm`、`setOneLiner`，并持久化到 sessionStorage。
- 所有 Pydantic 模型 `extra="forbid"`，字段名须与 prompt JSON 严格对齐（[models.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/models.py) 约定）。
- system prompt 用 `get_system_prompt()` 加载（自动转义花括号），模板变量放 human message（[config.py:106-121](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py#L106-121)）。
- 联网搜索结论：爆款选题核心维度 = 搜索热度 + 用户痛点 + 创意角度 + 流量钩子 + 受众定位；常见做法是生成多候选让用户选（human-in-the-loop）。

---

## Proposed Changes

### A. 后端新增

#### A1. `qinghe-video/src/prompts/topic.txt`（新增）

选题 system prompt。结构仿 [polish.txt](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/prompts/polish.txt)：角色 → 职责 → 输入格式 → 输出 JSON 结构 → 约束。

要点：
- 角色：「青禾映画」农业短视频爆款选题 Agent。
- 职责：基于产品名 + 一句话创意 + 目标平台，生成 N 个差异化爆款主题候选，覆盖不同创意角度（产地溯源、种植过程、美食制作、对比测评、生活方式等）。
- 输出 JSON 结构（字段名与下方 `TopicOutput` 严格对齐）：
  ```json
  {
    "topics": [
      {
        "theme": "爆款主题标题（一句话，含钩子）",
        "creative_angle": "创意角度/切入点",
        "pain_point": "用户痛点或共鸣点",
        "target_audience": "预期受众画像",
        "traffic_hook": "开头3秒钩子",
        "appeal_reason": "为什么有爆款潜力"
      }
    ]
  }
  ```
- 约束：候选之间创意角度必须差异化；主题要具体可执行避免空泛；用中文；遵守 `extra="forbid"`（不能输出额外字段）。

#### A2. `qinghe-video/src/topic_generation.py`（新增，≤200 行）

仿 [text_polish.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/text_polish.py) 完整复刻范式。包含：

- 模块级加载 prompt：`SYSTEM_PROMPT = get_system_prompt("topic")`
- `TopicRequest(BaseModel)`：`product_name: str`、`one_liner: str`、`target_platform: str = "抖音"`、`count: int = 6`（用 `Field(ge=3, le=10)` 约束）。`extra="forbid"`。
- `TopicCandidate(BaseModel)`：`theme / creative_angle / pain_point / target_audience / traffic_hook / appeal_reason`，全部 `str`。`extra="forbid"`。
- `TopicOutput(BaseModel)`：`topics: list[TopicCandidate]`（`min_length=3`）。`extra="forbid"`。
- `generate_topics(req: TopicRequest) -> TopicOutput`：`get_llm(temperature=0.9)`（选题需要更高发散性，比 polish 的 0.7 高），`with_structured_output(TopicOutput)` + `ChatPromptTemplate`（system + human，human 含 `{product_name}/{one_liner}/{target_platform}/{count}` 变量）+ `chain.invoke()`。失败 `raise RuntimeError`。
- 模块顶部 docstring 含用法示例（仿 [text_polish.py:6-13](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/text_polish.py#L6-13)）。

**注意**：`TopicCandidate` / `TopicOutput` 定义在 `topic_generation.py` 而非 `models.py`，因为它们不入图、不与 state 共享，与 `PolishResult` 定义在 `text_polish.py` 的惯例一致。

### B. 后端修改

#### B1. `qinghe-video/src/main.py`

- 顶部 import：`from src.topic_generation import TopicRequest, generate_topics`（仿 [main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) 中 `from src.text_polish import PolishRequest, polish_user_input` 的位置）。
- 新增路由 `POST /api/topics/generate`（紧挨 [main.py:151-164](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py#L151-164) 的 polish 路由下方），签名：
  ```python
  @app.post("/api/topics/generate", summary="AI 生成爆款候选主题")
  def generate_topics_api(req: TopicRequest, _current_user: User = Depends(get_current_user)) -> dict[str, Any]:
  ```
  返回 `{"status": "success", "topics": result.topics}`（每个 topic 用 `.model_dump()`）。异常 `raise HTTPException(500, ...)`，与 polish 路由一致。必须带 `Depends(get_current_user)`。

### C. 前端新增

#### C1. `qinghe-video/frontend/src/hooks/use-topic-generation.ts`（新增）

仿 [use-text-polish.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/hooks/use-text-polish.ts)：
```ts
export function useTopicGeneration() {
  return useMutation({
    mutationFn: (req: TopicRequest) =>
      apiPost<TopicResponse>("/api/topics/generate", req),
  });
}
```

#### C2. `qinghe-video/frontend/src/types/api.ts`（修改）

新增类型（紧挨现有 `PolishRequest`/`PolishResponse` 定义处）：
- `TopicRequest`：`product_name / one_liner / target_platform? / count?`
- `TopicCandidate`：与后端 `TopicCandidate` 字段一一对齐
- `TopicResponse`：`{ status: "success"; topics: TopicCandidate[] }`

### D. 前端修改

#### D1. `qinghe-video/frontend/src/stores/workshop-store.ts`（修改）

在 `WorkshopState` 接口新增（仿 `oneLiner` 模式）：
- `topics: TopicCandidate[]` — 当前候选主题列表
- `selectedTopicIndex: number | null` — 用户选定的候选索引
- `setTopics(topics: TopicCandidate[]): void`
- `setSelectedTopicIndex(i: number | null): void`

`DEFAULT_STATE` 加 `topics: []`、`selectedTopicIndex: null`；`persist` 快照加这两个字段；`hydrate` 加恢复逻辑；`reset` 由 `...DEFAULT_STATE` 自动覆盖。

#### D2. `qinghe-video/frontend/src/components/workshop/WorkshopStepCard.tsx`（修改）

在 `PlannerCardBody`（[WorkshopStepCard.tsx:241-396](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/workshop/WorkshopStepCard.tsx#L241-396)）内接入选题 UI，位置：现有「AI 润写」按钮行（[L294-309](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/workshop/WorkshopStepCard.tsx#L294-309)）旁加「AI 选题」按钮，按钮下方展开候选卡片网格。

改动：
1. `PlannerCardBody` props 增加 `isGeneratingTopics: boolean`、`onGenerateTopics: () => Promise<void>`、`onSelectTopic: (index: number) => Promise<void>`（由父组件 `WorkshopStepCard` 传入，与 `isPolishing`/`onPolish` 同模式）。
2. 在「AI 润写」按钮旁加「AI 选题」按钮（`Sparkles` 图标 + 文案），`disabled` 条件：`store.form.product_name` 为空或 `isGeneratingTopics`。
3. 按钮行下方：当 `store.topics.length > 0` 时渲染候选卡片网格（`grid sm:grid-cols-2 gap-2`），每张卡片展示 `theme`（标题加粗）、`creative_angle`、`pain_point`、`traffic_hook`，右下角「采用」按钮。
4. 选中的卡片高亮（`border-primary`）；点击「采用」调用 `onSelectTopic(index)`。

#### D3. `qinghe-video/frontend/src/pages/WorkshopPage.tsx`（修改）

在 `handlePolish`（[WorkshopPage.tsx:47-61](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/pages/WorkshopPage.tsx#L47-61)）旁新增：
- `useTopicGeneration()` hook 实例。
- `handleGenerateTopics`：校验 `store.form.product_name` + `store.oneLiner` 非空，调用 `generateTopic.mutateAsync({product_name, one_liner, target_platform: store.form.target_platform})`，成功后 `store.setTopics(result.topics)`、`store.setSelectedTopicIndex(null)`。
- `handleSelectTopic(index)`：取 `store.topics[index]`，把 `theme` 写入 `store.setOneLiner(theme)`（作为新的一句话创意），`store.setSelectedTopicIndex(index)`，然后**自动调用 `handlePolish()`** 用新 oneLiner 补全完整表单——形成「选题 → 润写 → 表单 → planner」顺畅流。
- 把 `isGeneratingTopics` / `onGenerateTopics` / `onSelectTopic` 透传给 `<WorkshopStepCard>` 的 planner 分支（[WorkshopStepCard.tsx:102-106](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/components/workshop/WorkshopStepCard.tsx#L102-106)）。

---

## Assumptions & Decisions

1. **独立服务而非 graph 节点**：用户已确认。理由：选题需 human-in-the-loop（用户从候选里选），当前 graph 无 `interrupt_before`，做成节点会自动连跑无法暂停；polish 模式已验证低风险。
2. **轻量输入**：用户已确认。`TopicRequest` 只需 `product_name + one_liner`，`target_platform` / `count` 可选带默认值。
3. **候选数量默认 6**：基于搜索结果（常见 5-10 个），用 `Field(ge=3, le=10)` 约束，前端默认传 6。
4. **temperature=0.9**：选题需要发散性，高于 polish 的 0.7。
5. **选定后自动触发 polish**：减少用户操作步骤，选题→润写→表单一气呵成。若用户不希望自动润写，可改为只回填 oneLiner 不触发 polish（实现时加一个 confirm 即可，默认自动）。
6. **模型定义在 `topic_generation.py` 而非 `models.py`**：与 `PolishResult` 定义在 `text_polish.py` 的惯例一致——不入图的模型归各自服务模块。
7. **不改 `agent_steps.py` / `graph.py` / `state.py`**：选题不是 graph 节点，不写入 state，不参与单步执行。
8. **JWT 鉴权**：新路由必须 `Depends(get_current_user)`，与所有业务路由一致。
9. **prompt 用 `.txt` 扩展名**：`get_prompt`/`get_system_prompt` 写死读 `.txt`（[config.py:102](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py#L102)）。
10. **文件 ≤500 行**：`topic_generation.py` 约 150 行，`WorkshopStepCard.tsx` 改动后仍在限内（当前约 400 行，新增约 80 行，需在实现时确认；若超限则把选题卡片拆为独立组件 `TopicCandidateGrid.tsx`）。

---

## Verification Steps

### 后端
1. **单元测试**：在 `qinghe-video/tests/` 新增 `test_topic.py`（仿 `test_graph.py` 风格，无 LLM key）：
   - `TopicRequest` 构造、`count` 越界校验（`ge=3, le=10`）、`extra="forbid"` 验证。
   - `TopicCandidate` / `TopicOutput` `extra="forbid"` 验证。
   - `topic.txt` prompt 文件存在且可加载（`get_system_prompt("topic")` 不抛错）。
   - `topic_generation.py` 模块可导入（prompt 模块级加载成功）。
2. **运行**：`cd qinghe-video && pytest tests/test_topic.py -v` 全绿。
3. **回归**：`pytest tests/ -v` 现有测试不受影响。
4. **手动 API 验证**：启动后端，先 `POST /api/auth/login` 拿 token，再 `POST /api/topics/generate` 带 `Authorization: Bearer <token>`，body `{"product_name":"阳山水蜜桃","one_liner":"想拍产地溯源短视频"}`，确认返回 6 个候选且字段齐全。无 token 时返回 401。

### 前端
5. **类型检查**：`cd qinghe-video/frontend && npm run lint && npx tsc -b` 无错误。
6. **手动 UI 验证**：`npm run dev`，进入 `/#/workshop`，在策划卡片填产品名 + 一句话创意，点「AI 选题」，确认候选卡片渲染；点某张卡片「采用」，确认 oneLiner 被替换为 theme、表单被 polish 自动补全；刷新页面确认 sessionStorage 恢复 `topics` / `selectedTopicIndex`。
7. **边界**：未填产品名时「AI 选题」按钮 disabled；选题失败时展示错误（复用现有 `stepErrors` 机制或 alert）。

### 集成
8. 选定主题后，点「执行」跑 planner，确认 planner 能消费补全后的表单，整条流水线正常。
