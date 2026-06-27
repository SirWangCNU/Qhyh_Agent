# Agent 分步工坊内容隔离 Bug 修复 + 前端 UI 重设计方案

## 一、问题分析

### 1.1 Bug 根因

当用户在分步工坊点击不同 Agent 步骤（如「策划」→「文案」）时：

- [workshop.js#L73-L86](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/workshop.js#L73-L86) 的 `setActiveStep()` **只更新了顶部 header（编号/英文标签/标题/描述）和左侧导航 active 状态**
- 输出区域 `stepOutput`（[index.html#L261](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html#L261)）的内容**没有切换**，仍然显示上一次执行步骤的渲染结果
- 代码中只有一个 `stepOutput.innerHTML` 被复用，**没有按步骤缓存各自的输出内容**
- 导致现象：header 显示 "02 COPYWRITER / 文案 Agent"，但内容区仍显示策划 Agent 的主题/卖点/受众等字段（如用户截图所示）

### 1.2 后端状态分析

后端 [agent_steps.py#L84-L99](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/agent_steps.py#L84-L99) 逻辑正确：
- `build_step_state` 正确合并了上游 state + 用户输入
- 每个节点返回对应 `STEP_OUTPUT_KEY`（`planner_output` / `copywriter_output` 等），互不覆盖
- 返回值包含 `output_key` 和 `output`，前端可以正确区分

**Bug 纯在前端**：缺少步骤输出缓存与切换显示逻辑。

### 1.3 现有前端状态问题

[workshop.js#L38-L43](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/workshop.js#L38-L43)：
```javascript
var workshopState = {};   // 全局累计 state（正确）
var userInput = null;
var activeStep = "planner";
var doneSteps = {};       // 仅记录布尔值 done/未完成
var lastError = null;
// 缺少：stepOutputs = {}  每步的渲染 HTML 缓存
```

## 二、设计方向

**Design Read**: 这是一个应用内创作工作台 UI，面向农产品短视频创作者，风格延续现有编辑式有机风（暖米纸色 + 森林绿 + 麦穗金），但参考用户提供的像素风 Agent 卡片截图，将左侧步骤导航重新设计为**像素艺术头像 + 中文/英文名 + 角色标语**的 Agent 卡片列表，同时修复内容隔离问题。

设计三档（基于 design-taste-frontend skill）：
- `DESIGN_VARIANCE: 6`（结构化但不刻板）
- `MOTION_INTENSITY: 4`（hover 微动画、切换过渡）
- `VISUAL_DENSITY: 5`（工作台需要信息密度但不拥挤）

设计参考用户截图的核心特征：
1. 每个 Agent 有一个**像素风格头像图标**（简约方块像素脸，不同角色不同配色）
2. 中文名 + 英文大写名（如「文案 / COPYWRITER」）
3. 一句话角色标语（如「会讲故事的笔」）
4. 选中状态：卡片深色填充 + 对勾标记
5. 未选中：浅色/边框态
6. 内容输出区：结构化字段卡片，左侧绿色竖线标记（现有 `field-card` 已有 left-border，但需强化）

## 三、修改文件清单

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `frontend/assets/js/workshop.js` | 修改 | 核心 Bug 修复：增加 stepOutputs 缓存，setActiveStep 切换输出显示 |
| `frontend/assets/css/workshop.css` | **新建** | 重设计分步工坊样式（像素 Agent 卡片 + 输出区美化） |
| `frontend/assets/css/style.css` | 修改 | 移除/更新旧的 step-rail / step-card / field-card 样式，避免冲突 |
| `frontend/index.html` | 修改 | 更新分步工坊 HTML 结构（步骤卡片结构 + 引入 workshop.css） |
| `frontend/assets/js/agent-renderers.js` | 微调 | 优化字段卡片样式类名，适配新设计 |

> 后端代码（`src/`）**无需修改**，Bug 纯前端。

## 四、具体实施步骤

### Step 1: 修复 workshop.js — 步骤输出缓存与切换

**文件**：[workshop.js](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/workshop.js)

核心改动：

1. **新增 `stepOutputs` 对象**，按 step key 缓存每个步骤的渲染 HTML：
   ```javascript
   var stepOutputs = {};  // { planner: "<div>...</div>", copywriter: "<div>...</div>" }
   ```

2. **修改 `setOutput()`**：不再直接操作 `stepOutput.innerHTML`，而是将内容写入 `stepOutputs[activeStep]` 缓存，然后调用 `displayStepOutput()`。

3. **新增 `displayStepOutput(stepKey)`**：
   - 如果 `stepOutputs[stepKey]` 存在 → 渲染到 DOM
   - 如果不存在且该步骤已 done → 显示空态（不应该发生，防御性）
   - 如果该步骤未执行 → 显示「等待执行」提示

4. **修改 `setActiveStep(stepKey)`**：
   - 保持现有 header 更新逻辑
   - 最后调用 `displayStepOutput(stepKey)` 切换输出区内容
   - 重置素材区（imgGallery/videoPreview）显示状态为隐藏（素材区内容不属于单个步骤，保持全局可见但切换步骤时不影响）

5. **修改 `runStep()` 成功回调**：
   - `doneSteps[activeStep] = true` 后
   - 保留 `workshopState = data.state`
   - 将渲染结果存入 `stepOutputs[activeStep]`（而不是直接 setOutput）
   - 调用 `displayStepOutput(activeStep)` 显示

6. **修改 `reset()`**：清空 `stepOutputs = {}`

### Step 2: 新建 workshop.css — 重设计 Agent 卡片与输出区

**新文件**：`frontend/assets/css/workshop.css`

#### 2.1 左侧 Agent 导航卡片（像素风）

将现有 `.step-rail` 从简单按钮列表重设计为像素 Agent 卡片：

- 卡片尺寸约 `100% × ~72px`，flex 布局
- 左侧：**36×36px 像素头像**（纯 CSS 绘制，用 `box-shadow` 像素艺术技巧），6 个 Agent 各有配色：
  - 01 策划 PLANNER：森林绿 `#3d5a3d` 背景 + 像素眼镜/思考者
  - 02 文案 COPYWRITER：麦穗金 `#c9a961` 背景 + 像素笔
  - 03 脚本 SCRIPTWRITER：陶土橙 `#b85c38` 背景 + 像素场记板
  - 04 视觉 VISUAL：天青蓝 `#4a7c9b` 背景 + 像素调色板
  - 05 投放 DISTRIBUTOR：深墨绿 `#2d4a2d` 背景 + 像素喇叭
  - 06 报告 REPORT：暖木棕 `#6b5238` 背景 + 像素文档
- 右侧：中文名加粗 + 英文大写小字（`font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-ink-faint)`）+ 角色标语小字
- 选中态（`.is-active`）：左侧 3px 森林绿竖条 + 背景浅色填充 `rgba(61,90,61,0.06)` + 头像右侧绿色对勾标记
- 完成态（`.is-done`）：卡片右上角色麦穗金小圆点
- 错误态（`.is-error`）：左侧 3px 陶土橙竖条
- hover：背景微变 + 轻微 `translateX(2px)` 位移

#### 2.2 输出区域美化

- `.step-stage` 容器增加细微背景色区分
- `.field-card` 增强：左侧 3px 森林绿竖线（保留现有样式），内边距微调，增加 hover 微阴影
- `.hook-card` 引用样式：加大引号装饰，衬线字体
- `.cta-card`：麦穗金左边框 + 浅金背景
- `.shot-table` 斑马纹优化
- `.shot-prompt-card` 增加圆角和阴影
- 输出区滚动条美化（细滚动条，品牌色滑块）
- 空态/等待态：居中麦穗图标 + "等待执行 · 点击「执行当前步骤」开始"

#### 2.3 响应式

- `<=768px`：step-rail 改为横向滚动条（flex row），卡片宽度自适应 ~120px
- 头像缩小为 28px

### Step 3: 修改 index.html — 更新 HTML 结构

**文件**：[index.html#L230-L263](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html#L230-L263)

1. **引入 workshop.css**：在 `<head>` 中，auth.css 之后追加：
   ```html
   <link rel="stylesheet" href="assets/css/workshop.css" />
   ```

2. **重写 step-rail 卡片结构**（每个 `.step-card` 从简单按钮改为含头像+名字+标语的卡片）：
   ```html
   <button class="step-card is-active" data-step="planner">
     <span class="step-card__avatar step-card__avatar--planner"></span>
     <span class="step-card__body">
       <strong>策划</strong>
       <small>PLANNER</small>
       <em>主题、受众、卖点</em>
     </span>
     <span class="step-card__check">✓</span>
   </button>
   ```
   6 个卡片依次类推（planner/copywriter/scriptwriter/visual_designer/distributor/report_generator）。

3. 保持 step-stage 区域结构基本不变（header + stepOutput + 按钮）。

### Step 4: 清理 style.css 中旧的 step 样式

**文件**：[style.css](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/css/style.css)

将旧的 `.step-rail`、`.step-card`、`.step-card__num`、`.step-stage` 等分步工坊相关样式替换/移除，避免与新 workshop.css 冲突。保留 `.field-card`、`.hook-card`、`.cta-card`、`.shot-table` 等 agent-renderers 使用的样式类（在 workshop.css 中增强而非替换）。

具体做法：在 style.css 中找到 `.step-workbench`、`.step-rail`、`.step-card`、`.step-stage` 相关规则块，将它们注释掉或删除，因为这些将由 workshop.css 重新定义。保留 `.module`、`.container`、`.eyebrow`、`.btn` 等全局样式。

### Step 5: 微调 agent-renderers.js

**文件**：[agent-renderers.js](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/agent-renderers.js)

- 现有渲染逻辑无需大改，已使用 `.field-card`、`.hook-card`、`.cta-card` 等类名
- 为每个步骤的输出容器 `wrap()` 增加步骤标识 class（如 `agent-output--planner`），方便 CSS 做步骤特定样式（但统一风格即可，不做步骤特定色）

## 五、像素头像 CSS 技术方案

使用纯 CSS `box-shadow` 像素画技术，为每个 Agent 绘制 8×8 像素头像。示例（策划 - 思考者/眼镜）：

```css
.step-card__avatar--planner {
  background: #3d5a3d;
  /* 用 box-shadow 逐像素绘制，或用简化方案：emoji/SVG */
}
```

考虑到纯 CSS box-shadow 像素画代码量较大，采用**更轻量方案**：使用 Unicode 表情符号作为头像内容（📋 ✍️ 🎬 🎨 📣 📄），配合不同背景色，既保持像素风的方块感又不引入大量 CSS。表情符号用 `font-size: 18px`，在 36px 圆角方块中居中显示。

> 这是务实选择：如果用户后续需要真正的像素艺术 SVG，可以替换。当前以功能性 + 视觉区分度为优先。

## 六、验证步骤

1. **Bug 验证**：
   - 填写表单 → 执行「策划」→ 看到策划内容（主题/卖点/受众）
   - 点击左侧「文案」卡片 → 输出区显示「等待执行」（不再复用策划内容）
   - 点击「执行当前步骤」执行文案 → 看到文案内容（Hook/正文/CTA）
   - 点击回「策划」→ 看到之前缓存的策划内容（保留不丢失）
   - 依次执行全部 6 步，切换任意步骤都显示各自的正确内容
   - 点击「重新生成」→ 所有缓存清空，回到初始状态

2. **UI 验证**：
   - 6 个 Agent 卡片有不同颜色头像图标
   - 选中卡片有高亮边框和对勾
   - 完成卡片有完成标记
   - 输出区字段卡片样式统一美观
   - 移动端横向滚动正常
   - 与现有页面风格（暖米纸色/森林绿/麦穗金/Fraunces 衬线）协调

3. **测试**：
   - `pytest tests/ -v` 无回归（后端未改）
   - 浏览器 DevTools 无 JS 报错
   - 各 fetch 请求正确携带 Authorization token（auth.js 已包装）
