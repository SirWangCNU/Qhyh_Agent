# 一致性生图功能改进计划

## Summary

工坊第 3 步「一致性生图」功能已完整实现（后端 `src/consistency_images/` + 前端 `ConsistencyImagesPanel.tsx` + 3 个 prompt 模板）。本次改进聚焦三个方向，按优先级分两期：

- **A 期（核心）**：Prompt 模板优化 + UI 关键交互增强 + visual_designer 分镜联动注入
- **B 期（增强联动）**：出图步骤参考图传递（image-to-image）

改进后：模板输出更稳定、面板更好用、第 3 步不再是孤岛（生成的一致性描述会注入视觉 Agent，让分镜 prompt 与人物/物品/场景保持一致）。

---

## Current State Analysis

### 已实现（已验证可运行）

**后端** `src/consistency_images/`：
- `router.py`：`POST /api/consistency-images/generate`（multipart，参考图可选，JWT 鉴权）+ `GET /api/consistency-images/health`
- `prompt_builder.py`：`build_prompt(image_type, subject, style_preference)` 读 `.md` 模板用 `str.replace` 填占位符
- `image_generator.py`：`generate_consistency_image()` 异步调 doubao-seedream，有参考图→图生图，无→文生图，存 `outputs/image/`
- `models.py`：`ConsistencyImageRequest` / `ConsistencyImageResult`（`extra="forbid"`）
- 3 个模板：`consistency_images_character.md`（角色设定集：左大图 + 中三列正侧背 + 右 2×3 六宫格）、`consistency_images_object.md`（3×3 九宫格：6 方向 + 3 细节）、`consistency_images_scene.md`（2×2 四面环视图）
- `main.py:68` 已注册 `consistency_images_router`

**前端**：
- `ConsistencyImagesPanel.tsx`（299 行）：3 个 `ConsistencyCard` 子组件，各自独立生成（主体描述 + 风格偏好 + 可选参考图拖拽上传 + 结果展示/下载）
- `constants.ts`：9 步流水线，第 3 步 `consistency_images`，`DEFAULT_AUTO_RUN_TO = 5`
- `workshop-store.ts`：`mediaResults.characterImage/objectImage/sceneImage` 槽 + `setConsistencyImage` action
- `use-media.ts`：`useConsistencyImageGenerate()` hook（multipart fetch）
- `WorkshopPage.tsx`：`execConsistencyImages()` 仅校验是否至少一类 done；自动流跳过本步
- `WorkshopStepDetail.tsx`：第 3 步始终渲染 `<ConsistencyImagesPanel />`

### 现有问题（改进依据）

1. **模板问题**：
   - 人物模板用分数描述布局（1/3、1/6 宽度），模型理解松散，常不按布局出图
   - 三个模板都未明确「排列顺序」（左→右、上→下），子图位置随机
   - 主体锁定语不够强，多子图间人物/物品仍会变样
   - 无负向提示词段落、无质量自检清单
   - 场景模板用「北/南/东/西向」罗盘方向，模型易混淆；应改相对方向
   - 物品模板「俯视图/仰视图」对扁平物品无意义

2. **UI 问题**：
   - 无批量生成（3 类要逐个点）
   - 无「重新生成」按钮（要改描述才能重生）
   - 结果图无法放大查看细节
   - 无尺寸预设（固定 1920×1920）
   - 无法复制已生成的 prompt 复用到别处
   - 下载文件名是 `consistency_character_xxx.jpg`，无业务语义
   - 主体描述需手敲，未与策划/文案联动

3. **分镜联动缺失（最关键）**：
   - 第 3 步生成的人物/物品/场景描述**完全没有**流入后续步骤
   - `visual_designer_node`（`src/nodes/visual_designer.py:36`）只读 `scriptwriter_output` + `target_platform`，不知道第 3 步建立了什么人物/物品/场景
   - `execImageGen`（`WorkshopPage.tsx:196`）用 `shot_prompts` 纯文生图，未传第 3 步的参考图
   - 结果：第 3 步是孤岛，生成的一致性参考对成片毫无影响

---

## Assumptions & Decisions

1. **不破坏完整流水线**：`visual_designer_node` 同时服务于工坊单步和 `/api/generate` 完整流水线。改动必须向后兼容——`consistency_references` 不存在时行为不变（`state.get()` 返回 None）。
2. **状态传递走 workshopState**：工坊 `execLLMStep` 已把 `store.workshopState` 作为 `state` 传给后端（`WorkshopPage.tsx:185`），后端 `build_step_state`（`agent_steps.py:66`）做 `dict(request.state)` 合并。故只需把一致性描述塞进 `workshopState`，visual_designer 即可读到，无需改 API 签名。
3. **文件拆分**：`ConsistencyImagesPanel.tsx` 当前 299 行，加 UI 功能会超 500 行。必须拆出 `ConsistencyCard.tsx` 子组件文件。
4. **可用 shadcn 组件**：`dialog`（放大查看）、`select`（尺寸预设）均已存在，无需新增依赖。
5. **一键填充不调 LLM**：从 `store.form`（product_name/selling_points/origin）直接拼接预填主体描述，避免额外 API 调用，简单可靠。
6. **B 期参考图传递**：需扩展 `ImageGenerationRequest` + `generate_image()` 支持可选参考图，并让前端把 `characterImage.url` 转成后端可读路径传入。复杂度中等，单独成期。
7. **prompt 模板用 str.replace 占位符**：沿用现有 `{subject}`/`{style_preference}` 模式，不改 `prompt_builder.py` 逻辑（除非新增占位符）。
8. **不改 ConfigDict(extra="forbid")**：新增字段需同步后端 model 与前端 type，遵循项目约定。
9. **自动流仍跳过第 3 步**：`startAutoRun` 中 `if (cfg.key === "consistency_images") continue` 保留，因需用户主动输入主体描述。
10. **下载命名**：前端 `<a download>` 属性设为 `{type}_{subject前10字}.jpg`，后端文件名不变（仍带时间戳防冲突）。

---

## Proposed Changes

### A 期 · 核心

#### A1. Prompt 模板优化（3 个 .md 文件）

**文件**：
- `qinghe-video/src/prompts/consistency_images_character.md`
- `qinghe-video/src/prompts/consistency_images_object.md`
- `qinghe-video/src/prompts/consistency_images_scene.md`

**改动**（三模板统一增强 + 各自针对性修复）：

1. **统一增强（三模板都加）**：
   - 顶部新增「主体锁定」段落：重复 `{subject}` 并强调"所有子图必须以此为唯一主体，禁止替换/变形/换装"
   - 新增「排列顺序」段落：明确"从左到右、从上到下依次填充各子格，位置严格对应下方编号"
   - 新增「负向提示词」段落：列出通用负向词（动漫、卡通、3D 渲染、模糊、变形、多余肢体、水印、文字）
   - 末尾新增「质量自检清单」：列 5-6 条检查项（主体一致？布局完整？子图位置正确？无风格漂移？背景统一？）

2. **人物模板针对性**：
   - 把"1/3 宽度""1/6 宽度"改为像素比例描述："画面横向分为 6 等份：左侧占 2 份（大图），中间 3 列各占 1 份，右侧六宫格占 2 列×3 行"
   - 强化六宫格表情差异要求：明确列出 6 种情绪（喜/怒/哀/惊/思/笑），避免仅嘴角变化

3. **物品模板针对性**：
   - 俯视/仰视改为"可选替代"：若物品扁平（如水果），俯视改"切面/内部特写"，仰视改"环境融入图"
   - 明确九宫格 3×3 的填充顺序编号对应位置

4. **场景模板针对性**：
   - 删除"北向/南向/东向/西向"罗盘描述，改"正面（主视角）/ 背面（转身 180°）/ 左侧（向左转 90°）/ 右侧（向右转 90°）"
   - 强化"空间连续性"：相邻视角的地平线、天空、建筑应能拼接呼应
   - 2×2 布局明确：左上=正面、右上=背面、左下=左侧、右下=右侧

**不改**：`prompt_builder.py`（占位符 `{subject}`/`{style_preference}` 不变）。

#### A2. UI 交互增强

**新增文件**：
- `qinghe-video/frontend/src/components/workshop/ConsistencyCard.tsx` — 从 `ConsistencyImagesPanel.tsx` 抽出的单卡片组件

**修改文件**：
- `qinghe-video/frontend/src/components/workshop/ConsistencyImagesPanel.tsx` — 瘦身为壳：顶部工具栏 + 3 个 `<ConsistencyCard>`
- `qinghe-video/frontend/src/components/workshop/ConsistencyLightbox.tsx`（新增）— 基于 `dialog.tsx` 的图片放大组件
- `qinghe-video/frontend/src/stores/workshop-store.ts` — `ConsistencyImageSlot` 无需改（已够用）；可选加 `sizePreference` 但暂不入 store（放卡片 local state 即可）

**功能点**：

| 功能 | 实现方式 |
|------|----------|
| 一键批量生成 | 面板顶部「全部生成」按钮，遍历 3 张卡片，对已填 subject 的依次触发 `handleGenerate()`（串行，避免并发超限） |
| 重新生成 | done 状态卡片结果区加「重新生成」按钮，重置 slot 为 loading 后重新调 hook |
| 放大查看 | 结果图点击 → 打开 `ConsistencyLightbox`（Dialog），显示全图 + prompt 文本 + 下载 |
| 尺寸预设 | 每张卡片加 `Select`：1920×1920（默认）/ 2048×2048 / 1536×1536，local state，传入 hook `size` 参数 |
| 复制 prompt | done 状态加「复制 prompt」按钮，`navigator.clipboard.writeText(slot.prompt)` |
| 下载命名 | `<a download={\`${type}_${subject.slice(0,10)}.jpg\`}>` |
| 一键填充 | 面板顶部「从策划填充」按钮：object→`{form.product_name}，{form.selling_points}`；scene→`{form.origin}`；character→留空（无数据）提示用户手填 |

**拆分后行数控制**：`ConsistencyCard.tsx` ~250 行，`ConsistencyImagesPanel.tsx` ~80 行，`ConsistencyLightbox.tsx` ~60 行，均在 500 行内。

#### A3. 分镜联动：注入 visual_designer（核心架构改进）

**目标**：第 3 步生成的人物/物品/场景描述自动注入第 5 步视觉 Agent，让 `shot_prompts` 与一致性参考绑定。

**后端改动**：

1. `qinghe-video/src/nodes/visual_designer.py`：
   - `visual_designer_node` 新增读取 `state.get("consistency_references")`
   - human prompt 模板新增条件段落：当 `consistency_references` 存在时，追加「【一致性参考】」段落，列出 character/object/scene 的 subject 描述
   - 用 Python 字符串拼接（非 LangChain 变量），避免无数据时出现空段落

2. `qinghe-video/src/prompts/visual_designer.txt`：
   - 新增「## 一致性参考（如提供）」职责段：当输入含一致性参考时，每个 shot_prompt 必须嵌入对应主体描述关键词，保持人物五官/服装、物品形态、场景元素与前序参考一致
   - 在 `consistency_guide` 字段说明中补一句：引用一致性参考的主体特征

**前端改动**：

3. `qinghe-video/frontend/src/types/api.ts`：
   - `GenerateResult` 新增可选字段 `consistency_references?: ConsistencyReferences`
   - 新增 `ConsistencyReferences` 接口：`{ character?: string; object?: string; scene?: string }`（仅存 subject 描述文本，不存 url）

4. `qinghe-video/frontend/src/components/workshop/ConsistencyCard.tsx`（A2 拆出）：
   - `handleGenerate` 成功后，除了写 slot，还调 `store.setConsistencyReferences(type, subject)` 把主体描述写入 `workshopState.consistency_references`

5. `qinghe-video/frontend/src/stores/workshop-store.ts`：
   - 新增 action `setConsistencyReferences(type, subject)`：更新 `workshopState.consistency_references[type]`
   - `reset()` 时清空该字段

**数据流验证**：
- 用户在第 3 步填"30 岁果农"→ 生成 → `workshopState.consistency_references.character = "30 岁果农"`
- 第 5 步 `execLLMStep("visual_designer")` 把 `workshopState`（含 `consistency_references`）作为 `state` 传后端
- 后端 `build_step_state` 合并 → `visual_designer_node` 读到 → human prompt 注入 → shot_prompts 含人物特征

---

### B 期 · 增强联动（可选，A 期完成后）

#### B1. 出图步骤参考图传递（image-to-image）

**目标**：第 7 步「出图」生成分镜图时，可选传入第 3 步的人物参考图，让分镜图与角色设定集视觉一致。

**后端改动**：
1. `qinghe-video/src/image_generation.py`：
   - `ImageGenerationRequest` 新增 `reference_image_path: str | None`（服务端可读路径，如 `/outputs/image/xxx.jpg`）
   - `generate_image()`：若有 reference_image_path，读文件转 base64 data URI，payload 加 `image` 字段（与 `consistency_images/image_generator.py` 同模式）

**前端改动**：
2. `qinghe-video/frontend/src/types/api.ts`：`ImageGenerationRequest` 加 `reference_image_path?: string`
3. `qinghe-video/frontend/src/pages/WorkshopPage.tsx` `execImageGen()`：
   - 读取 `store.mediaResults.characterImage?.url`，resolve 成后端路径
   - 传给 `generateImage.mutateAsync({ ..., reference_image_path })`
   - 加 UI 开关（第 7 步卡片内）：「使用人物参考图（图生图）」复选框

**注意**：B1 会显著增加出图耗时（图生图比文生图慢），且并非所有分镜都含人物。建议默认关闭，用户主动开启。

---

## Verification Steps

### A 期验证

1. **后端单元测试**：
   - `cd qinghe-video && pytest tests/ -v` — 确保 27 个现有测试仍全过（visual_designer 改动向后兼容）
   - 新增测试：`test_visual_designer_with_consistency_references` — 构造含 `consistency_references` 的 state，mock LLM，断言 human prompt 含主体描述

2. **后端导入与路由**：
   - `python -c "from src.main import app; print([p for p in app.openapi()['paths'] if 'consistency' in p])"` — 确认路由仍在

3. **前端类型检查**：
   - `cd qinghe-video/frontend && npx tsc --noEmit` — 0 error

4. **前端 lint**：
   - `cd qinghe-video/frontend && npm run lint` — 无新增 error

5. **Prompt 模板占位符**：
   - `python -c "from src.consistency_images.prompt_builder import build_prompt; print(build_prompt('character', '测试主体', None)[:200])"` — 确认 `{subject}`/`{style_preference}` 全部被替换，无残留占位符

6. **手动 E2E（需 API key）**：
   - 启动 `.\run.ps1`，登录，进工坊
   - 第 3 步：填人物主体「30 岁果农」→ 生成 → 确认出图、可放大、可复制 prompt、可重新生成
   - 「从策划填充」→ 确认 object/scene 自动填入
   - 「全部生成」→ 确认串行触发
   - 第 5 步视觉 Agent → 检查 `shot_prompts` 是否含人物特征词
   - 第 7 步出图 → 确认图片生成正常

### B 期验证

7. 开启「使用人物参考图」→ 出图 → 确认走图生图（耗时增加），人物外观与第 3 步一致

---

## Future Enhancements（本次不做）

- 一致性参考图历史记录（多版本对比）
- 人物参考图自动提取（从上传视频/图片中识别人物）
- 场景一致性扩展为 6 面环视图（上下加顶底）
- 一致性参考图导出为独立资产库（跨项目复用）
