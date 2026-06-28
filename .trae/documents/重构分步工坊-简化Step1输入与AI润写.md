# 重构分步工坊：简化 Step1 输入 + AI 一句话润写

## 摘要

当前分步工坊（`#/workshop`）要求用户填写 7 个字段（产品名/产地/品类/平台/时长/卖点/补充信息），门槛过高。本次重构将 **Step1「策划」** 改为：用户只填「产品名称 + 一句话创意」，点击「AI 润写」后由大模型推断产地、品类、卖点等完整信息，再交由现有 planner 流程生成策划方案。其余 7 步流水线保持不变。

新增一个轻量后端接口 `POST /api/text/polish`，专门负责一句话扩写为完整 `UserInput` 字段。

---

## 当前状态分析

### 前端（React + TS + Zustand）
- [WorkshopPage.tsx](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/pages/WorkshopPage.tsx) 第 276-337 行：产品信息表单含 7 个字段，`validateForm()` 强制校验 product_name / origin / category / selling_points。
- [workshop-store.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/stores/workshop-store.ts) 第 85-93 行：`DEFAULT_FORM` 包含全部 7 字段。
- [constants.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/lib/constants.ts) 第 103-112 行：8 步流水线定义，Step1 = planner。
- [use-agents.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/hooks/use-agents.ts)：单步 Agent 调用 `POST /api/agents/{step}`，请求体 = `{ input: UserInput, state }`。
- [api.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/lib/api.ts)：`apiPost` 封装，自动注入 Bearer token。

### 后端（FastAPI）
- [models.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/models.py) 第 233-247 行：`UserInput` 模型，product_name / origin / category / selling_points 为必填。
- [planner.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/nodes/planner.py)：planner 节点读取 state 中 7 个字段构造 prompt。
- [agent_steps.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/agent_steps.py) 第 65-81 行：`build_step_state()` 把 UserInput 字段写入 state。
- [main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) 第 136-147 行：`POST /api/agents/{step}` 端点。
- [llm.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/nodes/llm.py)：`get_llm()` 工厂，所有 LLM 调用统一入口。
- [config.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/config.py) 第 93-121 行：`get_prompt()` / `get_system_prompt()` 读取 `src/prompts/*.txt`。

### 约束
- AGENTS.md：每文件 < 500 行；main.py 当前 463 行，新增端点应精简。
- `UserInput` 的 `extra="forbid"`，新增字段会报错——不修改 UserInput，仅新增 polish 返回模型。
- planner prompt 依赖 origin/category/selling_points，所以润写后必须回填这些字段再调用 planner。

---

## 拟定改动

### 1. 新增后端模块 `src/text_polish.py`（新建）

轻量 LLM 润写服务：输入「产品名 + 一句话」→ 输出完整 UserInput 字段。

```python
# src/text_polish.py
from pydantic import BaseModel, Field

class PolishRequest(BaseModel):
    product_name: str
    one_liner: str  # 用户的一句话创意

class PolishResult(BaseModel):
    product_name: str
    origin: str
    category: str
    selling_points: str
    target_platform: str = "抖音"
    target_duration: str = "30-60秒"
    additional_info: str = ""

def polish_user_input(req: PolishRequest) -> PolishResult:
    """调用 LLM 把一句话创意扩写为完整 UserInput 字段。"""
    # 使用 get_llm() + get_system_prompt("polish")
    # with_structured_output(PolishResult) 严格输出
```

**实现要点**：
- 复用 `src/nodes/llm.py` 的 `get_llm(temperature=0.7)`。
- 用 `with_structured_output(PolishResult)` 保证输出可被后续 planner 直接消费。
- prompt 中明确：根据产品名 + 一句话推断产地/品类/卖点，可结合常识（如"阳山水蜜桃"→产地江苏无锡、品类水果）。

### 2. 新增 prompt 文件 `src/prompts/polish.txt`（新建）

系统提示词，指导 LLM 如何从一句话推断完整字段。内容要点：
- 角色：农业短视频信息补全助手
- 输入：产品名称 + 一句话创意
- 任务：推断产地、品类、核心卖点（结合产品名常识），保留用户创意意图
- 输出：严格 JSON（对齐 PolishResult 字段）

### 3. 新增后端端点 `POST /api/text/polish`（编辑 main.py）

在 [main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) 第 147 行（`/api/agents/{step}` 端点之后）插入：

```python
@app.post("/api/text/polish", summary="AI 一句话润写为完整输入")
def polish_text(req: PolishRequest, _current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """把用户的一句话创意扩写为完整 UserInput 字段（产地/品类/卖点等）。"""
    try:
        result = polish_user_input(req)
    except Exception as e:
        logger.exception("[API] 文本润写失败")
        raise HTTPException(status_code=500, detail=f"润写失败: {e}") from e
    return {"status": "success", "input": result.model_dump()}
```

**导入**：在 main.py 顶部新增 `from src.text_polish import PolishRequest, polish_user_input`。

### 4. 前端新增类型 `types/api.ts`（编辑）

在 [types/api.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/types/api.ts) 末尾新增：

```typescript
/** AI 润写请求（POST /api/text/polish）。 */
export interface PolishRequest {
  product_name: string;
  one_liner: string;
}

/** AI 润写响应。 */
export interface PolishResponse {
  status: string;
  input: UserInput;
}
```

### 5. 前端新增 hook `hooks/use-text-polish.ts`（新建）

```typescript
// frontend/src/hooks/use-text-polish.ts
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import type { PolishRequest, PolishResponse } from "@/types/api";

export function useTextPolish() {
  return useMutation({
    mutationFn: (req: PolishRequest) =>
      apiPost<PolishResponse>("/api/text/polish", req),
  });
}
```

### 6. 重构 `WorkshopPage.tsx` 表单区（编辑）

**改造前**（第 276-337 行）：7 字段网格表单。

**改造后**：两段式表单。

**第一段：极简输入区**
- 产品名称（Input，必填）
- 一句话创意（Textarea，必填，placeholder：「如：想拍阳山水蜜桃产地溯源」）
- 「AI 润写」按钮（调用 `useTextPolish`，loading 时显示 spinner）

**第二段：润写结果区（可折叠/可编辑）**
- 润写成功后展开，显示推断出的：产地 / 品类 / 卖点 / 目标平台 / 目标时长
- 每个字段可手动修改（用户可纠正 AI 推断）
- 提供「重新润写」按钮

**具体改动**：
- 删除第 276-337 行整个表单 div，替换为新的两段式表单组件。
- 新增本地 state：`oneLiner: string`、`polished: boolean`、`isPolishing: boolean`。
- `validateForm()` 改为：仅校验 `product_name` 和 `one_liner`（润写前）或润写后的 `selling_points`（润写后）。
- 润写成功后：`store.setForm(resp.input)` 回填完整字段，`setPolished(true)`。
- 8 步流水线执行逻辑（`executeStep` / `startAutoRun` 等）完全不变，仍从 `store.form` 取值。

### 7. 更新 `workshop-store.ts` 默认表单（编辑）

[workshop-store.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/stores/workshop-store.ts) 第 85-93 行 `DEFAULT_FORM`：保持不变（仍含全部字段，默认空串），因为 planner 仍需完整字段。新增 `oneLiner` 字段到 store 便于持久化：

```typescript
// 在 WorkshopState interface 新增
oneLiner: string;
setOneLiner: (v: string) => void;
```

`DEFAULT_STATE` 新增 `oneLiner: ""`，`persist` / `hydrate` 增加该字段。

### 8. 更新 Step1 描述文案（编辑）

[constants.ts](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/src/lib/constants.ts) 第 104 行，Step1 的 desc 改为：

```typescript
{ key: "planner", num: 1, title: "策划", emoji: "📋", kicker: "PLANNER", desc: "一句话创意 → AI 润写 → 完整策划", type: "llm", deps: [], defaultAuto: true },
```

---

## 假设与决策

1. **不修改 `UserInput` 模型**：保持 `extra="forbid"` 和必填字段不变，避免影响 `/api/generate`、`/api/agents/{step}` 等现有端点。润写接口返回的 `PolishResult` 字段与 UserInput 对齐，前端拿到后直接填入 store.form。
2. **润写为可选步骤**：用户也可手动展开完整表单填写，不强制走润写。但默认 UI 引导先润写。
3. **润写不依赖鉴权以外的任何前置状态**：纯文本输入 → 文本输出，不读写 workshopState。
4. **planner 节点不改**：planner 仍从 state 读 7 字段，润写后字段已回填，无需感知润写存在。
5. **prompt 文件命名 `polish.txt`**：遵循现有 `get_system_prompt("polish")` 约定，大括号会被自动转义。
6. **Step1 执行时机**：用户必须先润写（或手动补全）才能执行 planner，`validateForm` 在 `executeStep` 中仍会校验 selling_points 非空。

---

## 验证步骤

### 后端验证
1. 启动后端：`cd qinghe-video && uvicorn src.main:app --port 18739 --reload`
2. 调用 `POST /api/text/polish`，body：
   ```json
   { "product_name": "阳山水蜜桃", "one_liner": "想拍产地溯源短视频" }
   ```
3. 验证返回 `input.origin` ≈ "江苏无锡"、`input.category` ≈ "水果"、`input.selling_points` 非空。
4. 验证 `/api/agents/planner` 用润写后的 input 仍能正常返回策划方案。
5. 运行 `pytest tests/ -v` 确认现有测试不回归。

### 前端验证
1. 启动前端：`cd qinghe-video/frontend && npm run dev`
2. 访问 `#/workshop`，确认表单只有「产品名称 + 一句话创意」+「AI 润写」按钮。
3. 填入产品名和一句话，点击「AI 润写」，确认展开完整字段且可编辑。
4. 点击「开始执行」，确认 8 步流水线从 planner 开始正常跑完。
5. 刷新页面，确认 oneLiner 和润写结果从 sessionStorage 恢复。
6. 验证不润写、手动补全字段后也能正常执行。
