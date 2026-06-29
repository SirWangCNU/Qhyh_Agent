# 无限画布节点编辑器增强功能规划设计

## 一、概述

基于项目已有的 `/canvas` 无限画布页面，本次规划在用户截图所示的"节点式生成"交互方向上做一次功能增强：

1. **生成节点内置提示词 + 模型选择**：在现有 `generate` 节点中直接撰写/编辑提示词，并选择本次生成使用的图片模型（而非完全依赖后端 `.env` 固定模型）。
2. **图片节点自动标记**：生成成功后创建的结果图节点默认显示 `图片一`、`图片二`…等中文序号标签，便于用户识别和引用。
3. **提示词中 `@` 引用图片素材**：在提示词输入框内输入 `@` 弹出当前画布中所有图片节点（含参考图、结果图）列表，选中后自动插入占位符，生成时解析为参考图或 prompt 描述。

**第一版范围**：仅支持图片生成（用户已确认），视频/TTS/一键成片暂不做入节点编辑器；联网搜索节点暂不在本版本实现，作为后续可选扩展。保持现有 Chat/Workshop 入口不变。

---

## 二、现状分析

### 2.1 已有基础

项目已存在一套完整的无限画布实现，可直接复用：

| 模块 | 关键文件 | 现状 |
|------|---------|------|
| 页面入口 | `frontend/src/pages/CanvasPage.tsx` | 三栏布局：顶部项目栏 + 左侧工具栏 + 中右 React Flow 画布 + 右侧属性面板 |
| 画布容器 | `frontend/src/components/canvas/CanvasFlow.tsx` | 基于 `@xyflow/react`，已注册 4 类节点：referenceImage / prompt / generate / image |
| 节点类型 | `frontend/src/components/canvas/types.ts` | 定义了节点 data 结构、连线规则、尺寸选项、状态枚举 |
| 节点工厂 | `frontend/src/components/canvas/nodeFactory.ts` | 创建默认节点和生成结果图节点 |
| 状态管理 | `frontend/src/stores/canvas-store.ts` | zustand 管理 nodes/edges/viewport/selectedNodeId，自动保存 dirty 标记 |
| 生成编排 | `frontend/src/components/canvas/hooks/useCanvasGenerate.ts` | 收集入边 referenceImage + prompt → 调后端 `/api/canvas/projects/{id}/generate` |
| 后端 API | `src/canvas/router.py`、`src/canvas/service.py`、`src/canvas/models.py` | 项目 CRUD、生成接口、模型定义、资产落库 |
| 图片生成 | `src/image_generation.py` | 文生图 / 图生图，OpenAI 兼容网关，默认 `doubao-seedream-5-0-260128` |
| 上传 | `src/assets/__init__.py` 中 `save_uploaded_file` | 参考图上传并返回 URL |

### 2.2 当前缺失

1. **模型不可选**：`generate_image()` 只读 `settings.IMAGE_MODEL`，前端生成节点只有 `mode` + `size` 两个下拉框，无法切换模型。
2. **提示词与生成节点分离**：`prompt` 是独立节点，用户截图表达的是"提示词卡片驱动生成卡片"，而当前需要手动连线多个 prompt 节点。
3. **结果图无序号标签**：`ImageNode` 只显示"📷 结果图"，没有 `图片一 / 图片二` 标记。
4. **无 `@` 引用能力**：提示词输入框是原生 `Textarea`，不支持 mention 选择图片素材。

---

## 三、详细方案

### 3.1 后端改造：支持按请求选择模型

#### 目标
让 `/api/canvas/projects/{id}/generate` 接收 `model` 参数，生成时使用用户指定的模型，未指定时回退到 `settings.IMAGE_MODEL`。

#### 改动文件

**1. `src/config.py`**
- 新增 `IMAGE_MODEL_OPTIONS` 配置项（可选）：允许管理员在 `.env` 中配置前端可选择的模型列表，例如：
  ```
  IMAGE_MODEL_OPTIONS=doubao-seedream-5-0-260128,doubao-seedream-5-0-260129
  ```
- `Settings` 中解析为 `list[str]`，默认 `[settings.IMAGE_MODEL]`。

**2. `src/image_generation.py`**
- `ImageGenerationRequest` 增加可选字段 `model: str | None = None`。
- `generate_image(request)` 中：
  ```python
  model = request.model or settings.IMAGE_MODEL
  ```
  把 `model` 传入 OpenAI 兼容网关请求体。
- `generate_with_references(...)` 增加 `model: str | None = None` 参数，并透传给 `generate_image`。

**3. `src/canvas/models.py`**
- `GenerateRequest.params` 已经可扩展，额外约定 `params.model` 为本次生成模型。
- 可选：在 `GenerateRequest` 顶层增加 `model: str | None = None` 字段，更清晰。

**4. `src/canvas/service.py`**
- `run_generate` 从 `req.params` 中读取 `model`，调用 `generate_with_references(..., model=model)`。

**5. `src/main.py` 或 `src/canvas/router.py`**
- 新增 `GET /api/canvas/models`：返回前端可选的图片模型列表（从 `settings.IMAGE_MODEL_OPTIONS` 读取），供生成节点下拉框使用。

---

### 3.2 前端改造：生成节点内置提示词 + 模型选择

#### 目标
把提示词编辑能力内嵌到 `generate` 节点中，并增加模型选择下拉框。保留独立的 `prompt` 节点作为"可复用提示词片段"，但生成节点自身也能直接输入主提示词。

#### 改动文件

**1. `frontend/src/components/canvas/types.ts`**
- `GenerateNodeData` 扩展字段：
  ```ts
  export interface GenerateNodeData {
    kind: "generate";
    status: GenerateStatus;
    mode: GenerateMode;
    size: string;
    model: string;            // 新增：本次使用的模型
    prompt: string;           // 新增：节点内置主提示词
    negative_prompt?: string; // 新增：负向提示词
    error?: string;
  }
  ```
- 新增 `MODEL_OPTIONS: string[]`（初始从后端 `/api/canvas/models` 拉取，前端给一个兜底列表）。
- `defaultNodeData("generate")` 默认值同步更新。

**2. `frontend/src/components/canvas/nodeFactory.ts`**
- `defaultNodeData("generate")` 增加 `model: settings.IMAGE_MODEL 兜底`、`prompt: ""`、`negative_prompt: ""`。

**3. `frontend/src/components/canvas/nodes/GenerateNode.tsx`**
- 在现有"生成类型 / 输出尺寸"下方新增：
  - **模型选择**下拉框（调用 `useCanvasModels` 拉取可选模型）。
  - **提示词** `Textarea`（支持 `@` 唤起图片选择器，见 3.4）。
  - **负向提示词**折叠输入框（可选）。
- 保持左侧 target Handle 接收 referenceImage / prompt 入边。

**4. `frontend/src/components/canvas/hooks/useCanvasGenerate.ts`**
- 组装请求时：
  - 主 prompt = `generateNode.prompt` + 所有入边 `prompt` 节点文本，按顺序拼接。
  - 解析 prompt 中的 `@图片一` / `@图片2` 占位符，映射到对应图片节点的 `imageUrl` 加入 `references`。
  - `params.model` = `generateNode.model`。
  - `negative_prompt` = `generateNode.negative_prompt`。

**5. `frontend/src/hooks/use-canvas.ts`**
- 新增 `useCanvasModels()` hook：
  ```ts
  export function useCanvasModels() {
    return useQuery({
      queryKey: ["canvas", "models"],
      queryFn: () => apiGet<string[]>("/api/canvas/models"),
      staleTime: 5 * 60 * 1000,
    });
  }
  ```

**6. `frontend/src/components/canvas/panels/NodeInspector.tsx`**
- `GenerateEditor` 同步新增模型、提示词、负向提示词字段，与节点内编辑双向同步。

---

### 3.3 图片节点自动标记：图片一、图片二…

#### 目标
生成成功后，结果图节点按创建顺序自动获得中文序号标签，显示为 `图片一`、`图片二`…并在 `@` 选择器中可被引用。

#### 改动文件

**1. `frontend/src/components/canvas/types.ts`**
- `ImageNodeData` 增加：
  ```ts
  export interface ImageNodeData {
    kind: "image";
    imageUrl: string | null;
    sourceGenerateNodeId?: string;
    label: string;   // 新增：中文序号标签
    index: number;   // 新增：数字序号，从 1 开始
  }
  ```

**2. `frontend/src/components/canvas/nodeFactory.ts`**
- `makeImageNode` 接收 `index: number` 参数，生成 `label: toChineseNumber(index)` 和 `index`。
- 新增辅助函数 `toChineseNumber(n: number): string`：1→一，2→二，…，用于显示"图片一"。

**3. `frontend/src/components/canvas/nodes/ImageNode.tsx`**
- 头部标题从"📷 结果图"改为"📷 图片{label}"，例如"📷 图片一"。

**4. `frontend/src/components/canvas/hooks/useCanvasGenerate.ts`**
- 生成前/后统计当前画布中已有的 `image` 节点数量，计算新 `index`。
- 调用 `makeImageNode(url, position, generateNodeId, nextIndex)`。

**5. 向后兼容**
- 旧项目加载时可能缺少 `label/index` 字段，在 `ImageNode` 渲染时做兜底：
  ```ts
  const label = d.label ?? `图片 ${d.index ?? "?"}`;
  ```

---

### 3.4 提示词中 `@` 引用图片素材

#### 目标
在 `generate` 节点的提示词输入框（以及独立 `prompt` 节点，可选）中，输入 `@` 弹出浮层，列出当前画布中可引用的图片素材：

- 所有 `referenceImage` 节点（参考图）
- 所有 `image` 节点（结果图，按 `图片一、图片二` 显示）

选中后插入 `@图片一` 或 `@参考图-内容` 等占位符；生成时解析为图片 URL 加入 references。

#### 改动文件

**1. 新增组件 `frontend/src/components/canvas/shared/PromptMentionTextarea.tsx`**
- 基于 `contentEditable` div 或 `Textarea` + 浮动 Popover 实现。
- 监听 `@` 输入，计算光标位置，显示 Mention 选择浮层。
- 浮层项展示缩略图 + 名称（图片一 / 参考图-内容 / 参考图-风格）。
- 选中后插入格式：`@图片一`、`@参考图-内容`。
- 提供 `onChange(promptText: string)` 回调。
- 提供 `getReferencedImages(promptText: string)` 工具函数，返回引用的节点 id 列表。

**2. `frontend/src/components/canvas/nodes/GenerateNode.tsx`**
- 用 `PromptMentionTextarea` 替换原生 `Textarea`。

**3. `frontend/src/components/canvas/panels/NodeInspector.tsx` 中的 `PromptEditor`（可选）**
- 同样替换为 `PromptMentionTextarea`，使独立 prompt 节点也支持 @ 引用。

**4. `frontend/src/components/canvas/hooks/useCanvasGenerate.ts`**
- 新增 `resolvePromptReferences(promptText, nodes)`：
  - 遍历 prompt 中所有 `@xxx` 占位符。
  - 匹配 `image` 节点 label（图片一）或 `referenceImage` 节点 label。
  - 返回图片 URL 列表，作为 `references` 补充到生成请求。
  - 同时把占位符从 prompt 中移除或替换为节点 label 文本，避免传给模型产生歧义。

**5. 后端（可选增强）**
- 当前 `GenerateRequest.references` 已经支持传入多张参考图，前端解析后即可复用，后端无需改动。

---

### 3.5 其他配套改造

#### 1. 连线规则更新
- `frontend/src/components/canvas/types.ts` 中 `isValidConnection`：
  - `image` 节点可作为 source 连向 `generate` 节点？第一版可保持只读；若支持把结果图作为下一次生成的参考图，则增加 `image → generate` 的合法连线，并在 `useCanvasGenerate` 中处理。

#### 2. 生成节点模型列表兜底
- 若后端 `/api/canvas/models` 返回空或失败，前端使用硬编码兜底：`["doubao-seedream-5-0-260128"]`，保证可用。

#### 3. 向后兼容旧项目
- 加载旧画布项目时，`generate` 节点可能缺少 `model/prompt/negative_prompt`，在节点渲染和生成编排中均做兜底处理。

#### 4. 快捷键
- 在 `CanvasFlow` 中可选支持：
  - `Delete` 删除选中节点。
  - `Ctrl/Cmd + Enter` 在选中 `generate` 节点时直接触发生成。

---

## 四、数据流设计

### 4.1 生成节点单次生成流程

```
用户点击 GenerateNode「生成」
  │
  ▼
useCanvasGenerate.runGenerate(nodeId)
  │
  ├── 1. 收集入边源节点
  │      - referenceImage 节点 → references[]
  │      - prompt 节点 → prompt 片段
  │      - image 节点（若 image→generate 连线合法）→ references[]
  │
  ├── 2. 解析 generateNode.prompt 中的 @引用
  │      - @图片一 → 找到对应 image 节点 URL
  │      - @参考图-内容 → 找到对应 referenceImage 节点 URL
  │      - 加入 references[]，并从 prompt 中移除占位符
  │
  ├── 3. 组装 GenerateRequest
  │      {
  │        node_id,
  │        references: [...],
  │        prompt: generateNode.prompt + 入边 prompt 节点文本,
  │        negative_prompt: generateNode.negative_prompt,
  │        params: { size, model }
  │      }
  │
  ├── 4. POST /api/canvas/projects/{id}/generate
  │      后端 run_generate 读取 params.model → generate_with_references(..., model)
  │
  └── 5. 生成成功
         - updateNodeData(generateNode, status='done')
         - 计算下一个图片序号 nextIndex
         - makeImageNode(url, position, nodeId, nextIndex) → label='图片一/二...'
         - addNode(imageNode) + addEdgeRaw(generate→image)
```

### 4.2 @ 引用解析规则

| 占位符示例 | 匹配优先级 | 说明 |
|-----------|-----------|------|
| `@图片一` | 先匹配 image 节点 `label` | 结果图节点 |
| `@图片1` | 再匹配 image 节点 `index` | 兼容阿拉伯数字 |
| `@参考图-内容` | 匹配 referenceImage 节点 `label` | 自定义备注的参考图 |
| `@参考图` | 匹配任意 referenceImage 节点 | 兜底，取第一个 |

未匹配到的 `@xxx` 保留在 prompt 中作为普通文本，不报错。

---

## 五、任务拆分（推荐实现顺序）

| 阶段 | 任务 | 涉及文件 | 预估复杂度 |
|------|------|---------|-----------|
| P0-1 | 后端支持按请求模型生成 | `src/config.py`、`src/image_generation.py`、`src/canvas/models.py`、`src/canvas/service.py`、`src/canvas/router.py` | 中 |
| P0-2 | 前端生成节点增加模型选择 | `frontend/src/components/canvas/types.ts`、`nodeFactory.ts`、`GenerateNode.tsx`、`NodeInspector.tsx`、`use-canvas.ts` | 中 |
| P0-3 | 生成节点内置提示词/负向提示词 | `GenerateNode.tsx`、`NodeInspector.tsx`、`useCanvasGenerate.ts` | 低 |
| P1-1 | 结果图节点中文序号标记 | `frontend/src/components/canvas/types.ts`、`nodeFactory.ts`、`ImageNode.tsx`、`useCanvasGenerate.ts` | 低 |
| P1-2 | 提示词 `@` 引用图片素材 | 新增 `PromptMentionTextarea.tsx`、`GenerateNode.tsx`、更新 `useCanvasGenerate.ts` | 高 |
| P2 | 测试与回归 | `tests/test_canvas.py`、前端手动验证、向后兼容旧项目 | 中 |

---

## 六、关键决策与假设

1. **模型列表来源**：由后端 `settings.IMAGE_MODEL_OPTIONS` 控制，管理员决定用户可选哪些模型；前端只做展示，不硬编码商业模型列表。
2. **第一版仅图片**：不扩展 `GenerateNode.mode` 的视频/TTS 能力，保持现有 `mode` 字段但视频仍显示"暂未接入"。
3. **提示词内嵌 vs 独立 prompt 节点**：生成节点保留内置 prompt，同时保留独立 prompt 节点作为"可复用片段"，两者拼接使用。
4. **@ 引用占位符格式**：统一使用 `@图片一`、`@参考图-内容`，解析时优先精确匹配 label，未命中时尝试 index 匹配。
5. **向后兼容**：旧画布项目加载时缺少新字段，全部使用默认值（`model` 回退 `IMAGE_MODEL`，`prompt` 空字符串，`label/index` 运行时计算）。
6. **联网搜索节点**：本版本不实现，作为后续可选扩展。

---

## 七、验证步骤

### 7.1 后端验证

1. 启动后端，`pytest tests/` 现有测试通过。
2. 调用 `GET /api/canvas/models` 返回配置的模型列表。
3. 调用 `POST /api/canvas/projects/{id}/generate`，传入 `params.model` 为另一可用模型，确认返回图片 URL。

### 7.2 前端验证

1. 打开 `/#/canvas`，创建新项目。
2. 拖拽生成节点，确认节点内可编辑提示词、负向提示词、选择模型、选择尺寸。
3. 在提示词中输入 `@`，确认弹出当前画布图片列表（结果图/参考图）。
4. 拖拽参考图节点上传图片，在生成节点提示词中 `@参考图-内容` 引用，点击生成，确认图片生成使用了参考图。
5. 连续生成多次，确认结果图节点依次显示 `图片一`、`图片二`、`图片三`。
6. 刷新页面重新加载项目，确认图片序号标签和 @ 引用仍然正常。
7. 打开一个旧画布项目，确认无报错，缺少新字段时使用默认值。

### 7.3 集成验证

1. 从 Chat/Workshop 等其他页面切回 CanvasPage，确认状态隔离正常。
2. 生成节点选择不同模型生成，确认实际调用的是不同模型（可通过后端日志或图片风格判断）。

---

## 八、风险提示

1. **模型选择与实际可用性**：前端展示模型列表不代表所有模型当前可用，生成失败时需有友好错误提示。
2. **@ 引用解析歧义**：若用户手动输入 `@图片一` 但无对应节点，按普通文本处理；建议 UI 中通过 mention 选择器避免手误。
3. **大图片序列化**：画布项目 nodes/edges 以 JSON 整体存储，图片 URL 较多时应注意 SQLite 文本字段大小限制（通常足够，但需留意异常项目）。
4. **并发生成**：当前 `useCanvasGenerate` 是单节点触发，若用户同时触发多个生成节点，需确保序号计算无竞态（由 React 单线程 + zustand setState 保证，但仍需测试）。
