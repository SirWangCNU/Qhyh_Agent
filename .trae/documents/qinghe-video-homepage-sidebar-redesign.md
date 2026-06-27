# 青禾映画首页重设计计划：左侧边栏 + 保留顶栏

## 1. 摘要

在保留现有顶部导航与暖色有机主题的前提下，为 `qinghe-video` 前端增加一个**默认折叠的左侧边栏**。边栏承担「方案/历史列表 + 当前生成进度」的角色；顶部导航继续保留主要功能标签（对话创作、分步工坊、Agent 管理、关于）。所有现有功能均不删除，仅重新排布入口。

## 2. 现状分析

### 2.1 现有结构
- `frontend/index.html` 是单页入口，所有路由区块内嵌。
- 顶部导航 `.site-header` 包含：品牌、对话创作、分步工坊、规划设计、Agent 管理、关于、健康状态、登出。
- 路由系统 `router.js` 通过 hash 切换 `.page-section`：`#/chat`、`#/workshop`、`#/plan`、`#/agents`、`#/about`。
- 方案历史由 `chat.js`/`plan.js` 共用 `localStorage` key `qinghe_plans` 存储。
- 生成进度由 `pipeline.js` 提供，但对应 DOM ID（`#pipelineFlow`、`#progressFill`、`#statusLine`）当前在 HTML 中缺失，导致 `app.js` 的状态更新实际上未渲染。
- 当前默认路由为 `#/chat`（对话创作页）。

### 2.2 关键问题
1. 顶部导航项目过多，「规划设计」与「对话创作」在概念上重叠。
2. 生成进度无可见 UI。
3. 方案历史仅在 `#/plan` 页面可见，无法在任何创作页快速切换。

## 3. 设计决策

| 决策 | 内容 |
|------|------|
| 边栏形态 | 默认折叠的窄边栏（约 64px），可展开至 260px；带汉堡/箭头切换按钮。 |
| 顶栏职责 | 品牌、全局导航（对话创作 / 分步工坊 / Agent 管理 / 关于）、后端健康状态、登出。 |
| 边栏职责 | 新建方案按钮、当前生成进度、我的方案历史列表。 |
| 默认路由 | 保持 `#/chat`（对话创作）作为首页入口。 |
| 主题/字体 | 完全复用现有 CSS 变量：`--color-bg`、`--color-brand`、`--color-accent`、`--font-display`、`--font-body`。 |
| 功能保留 | 不删除 `chatPage`、`planPage`、`agentsPage`、`workshop`、`create`、`result`、鉴权、footer 等任何模块。 |
| 进度显示 | 在边栏中恢复 `pipeline.js` 所需的 6 节点进度条与状态文本，由 `app.js` 驱动。 |

## 4. 改动清单

### 4.1 `frontend/index.html`

**新增左侧边栏容器**（放在 `<body>` 内、`site-header` 之前或平级）：

```html
<aside class="site-sidebar is-collapsed" id="siteSidebar" aria-label="方案边栏">
  <button class="sidebar__toggle" id="sidebarToggle" aria-label="展开/收起边栏">
    <svg><!-- 汉堡/箭头图标 --></svg>
  </button>

  <div class="sidebar__new">
    <button class="sidebar__fab" id="sidebarNewPlan" title="新建方案">+</button>
    <span class="sidebar__label">新建方案</span>
  </div>

  <div class="sidebar__progress" id="sidebarProgress">
    <!-- 生成中显示 pipeline.js 的 6 节点进度 -->
    <div class="pipeline-flow" id="pipelineFlow"></div>
    <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
    <div class="status-line" id="statusLine"><span id="statusText">就绪</span></div>
  </div>

  <nav class="sidebar__plans" id="sidebarPlans" aria-label="我的方案">
    <h3 class="sidebar__section-title">我的方案</h3>
    <div class="sidebar__list" id="sidebarPlanList"></div>
  </nav>
</aside>
```

**包裹主内容区**：
- 将 `<header class="site-header">`、`<main>`、`<footer>` 整体包入一个 `.site-body` 容器，与 `.site-sidebar` 横向排列。

**移除顶部导航中的「规划设计」入口**：
- 将 `#/plan` 从 `.site-nav` 移除，避免与边栏功能重复；保留 `#/plan` 路由本身，作为「我的方案」管理页，可通过边栏底部「查看全部」进入。

### 4.2 `frontend/assets/css/style.css`

**新增布局变量**：
```css
:root {
  --sidebar-collapsed: 64px;
  --sidebar-expanded: 260px;
  --sidebar-bg: var(--color-bg-alt);
  --sidebar-border: var(--color-border);
}
```

**新增布局类**：
- `.site-wrapper`：Flex 行布局，100vw/100vh，overflow hidden。
- `.site-sidebar`：固定左侧，高度 100vh，flex-col，transition width 0.25s ease。
- `.site-sidebar.is-collapsed`：宽度 64px，隐藏文字标签，只显示图标。
- `.site-sidebar.is-expanded`：宽度 260px，显示完整方案列表。
- `.site-body`：flex-1，min-width 0，overflow-y auto；margin-left 随边栏状态变化。
- `.sidebar__toggle`、`.sidebar__fab`、`.sidebar__plans`、`.sidebar__list`、`.sidebar__plan-item` 样式。
- 恢复 `.pipeline-flow`、`.node`、`.progress-track`、`.progress-fill`、`.status-line` 的样式（可复用原 `style.css` 中已存在的 pipeline 样式，只需确保 DOM 存在）。

**响应式**：
- 移动端（≤768px）：边栏默认折叠为 64px；展开时作为 overlay 覆盖内容区，不影响主内容宽度。

### 4.3 `frontend/assets/js/sidebar.js`（新建模块）

职责：
1. 展开/收起边栏（持久化到 `localStorage`：`qinghe_sidebar_collapsed`）。
2. 渲染「我的方案」列表（读取 `Q.chat.getState()` 或 `localStorage.getItem('qinghe_plans')`，解析并渲染）。
3. 绑定方案点击事件：调用 `Q.chat.loadPlan(planId)` 并导航到 `#/chat`。
4. 提供 `Q.sidebar.refresh()` 供 `chat.js`、`plan.js`、`app.js` 调用。
5. 提供 `Q.sidebar.showProgress()` / `hideProgress()` 接口。

暴露接口：
- `Q.sidebar.toggle()`
- `Q.sidebar.refresh()`
- `Q.sidebar.renderPlans()`
- `Q.sidebar.setProgress(ratio, text)`
- `Q.sidebar.setNodeState(key, state)`

### 4.4 `frontend/assets/js/pipeline.js`

**适配新 DOM**：
- 初始化时检查 `#pipelineFlow` 是否存在；若存在则渲染 6 个节点图标/标签。
- 保留现有 `setNodeState`、`setProgress`、`setStatus`、`resetNodes` 接口。
- 在 `setStatus` 中同时更新 `#statusText` 与边栏中的 `#statusText`（若存在）。

### 4.5 `frontend/assets/js/app.js`

**进度可视化修复**：
- 在 `startGenerate()` 开始/进行中/完成/错误时，调用 `Q.sidebar.showProgress()` 并驱动 `Q.pipeline` 更新 `#pipelineFlow`。
- 生成完成后调用 `Q.sidebar.refresh()` 刷新方案列表（因为 `chat.js` 会保存新方案到 `qinghe_plans`）。
- 错误时保持进度可见，方便用户查看失败节点。

### 4.6 `frontend/assets/js/router.js`

**同步顶栏与边栏状态**：
- 当路由切换到 `#/chat`、`#/workshop`、`#/agents` 时，保持边栏可见。
- 当路由为 `#/about` 时，边栏可保持当前状态。
- 提供 `Q.router.navigate()` 兼容边栏收起/展开时的布局重算（触发自定义事件 `qinghe:layout`）。

### 4.7 `frontend/assets/js/chat.js`

**通知边栏刷新**：
- 在 `savePlan()` 后调用 `Q.sidebar.refresh()`。
- 在 `loadPlan()` 后高亮边栏对应方案项。
- 提供 `Q.chat.getPlanList()` 便捷接口供 `sidebar.js` 读取。

### 4.8 `frontend/assets/js/plan.js`

**与边栏联动**：
- 在删除/新建方案后调用 `Q.sidebar.refresh()`。
- `#/plan` 页面作为「方案管理」详情页保留，边栏中「我的方案」区块顶部增加「查看全部 →」链接指向 `#/plan`。

## 5. 信息架构最终布局

```
┌──────────────────────────────────────────────────────────────────────┐
│  [顶部导航]  青禾映画  |  对话创作  分步工坊  Agent管理  [健康] [登出]  │
├──────┬───────────────────────────────────────────────────────────────┤
│ 侧  │  < 新建 +                                                     │
│ 边  │  ┌─────────┐                                                  │
│ 栏  │  │ 进度条  │  （仅在生成中展开）                                │
│(可折│  └─────────┘                                                  │
│ 叠) │  我的方案                                                      │
│      │  · 方案 A                                                    │
│      │  · 方案 B                                                    │
│      │  查看全部 →                                                  │
├──────┴───────────────────────────────────────────────────────────────┤
│  主内容区（路由页面）                                                 │
│  · #/chat    对话创作页                                               │
│  · #/workshop 分步工坊                                                 │
│  · #/agents  Agent 管理                                                │
│  · #/plan    方案管理（保留，作为边栏「查看全部」目标）                  │
└──────────────────────────────────────────────────────────────────────┘
```

## 6. 假设与依赖

- 继续使用纯原生 HTML/CSS/JS，不引入新框架。
- `localStorage` 中 `qinghe_plans` 格式与 `chat.js` 当前格式一致。
- 后端 API 地址与健康检查逻辑保持不变。
- 移动端以 768px 为断点，边栏展开时以 overlay 形式呈现。
- 新模块 `sidebar.js` 需遵守「单文件 < 500 行」约定；若逻辑膨胀则拆分 `sidebar-plans.js`、`sidebar-progress.js`。

## 7. 验证步骤

1. 启动后端 `uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload`。
2. 打开 `http://localhost:18739/`。
3. 确认默认进入 `#/chat`，左侧边栏默认折叠为 64px。
4. 点击切换按钮，边栏展开至 260px，显示「新建方案」与「我的方案」区域。
5. 在对话创作页发送请求，观察边栏中进度条与 6 节点状态实时更新。
6. 生成完成后，边栏方案列表出现新条目；点击可加载历史方案。
7. 切换顶部导航到「分步工坊」「Agent 管理」，确认边栏保持可见且功能正常。
8. 进入 `#/plan`，确认方案管理页仍可独立使用，且删除/新建方案后边栏同步刷新。
9. 在移动端浏览器或 DevTools 模拟 ≤768px，确认边栏收起/展开为 overlay，不挤压主内容。
10. 运行 `pytest tests/ -v`，确认后端单元测试未受前端改动影响。
