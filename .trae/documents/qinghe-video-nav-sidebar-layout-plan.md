# 青禾映画 · 顶部导航 + 左侧边栏功能布局方案

## 1. 设计目标

- **保留顶部导航栏关键样式**：继续使用现有的毛玻璃 sticky header、品牌 Logo、下划线 active 态。
- **主题不变**：沿用现有 editorial organic 设计系统（暖米纸色、森林绿、麦穗金、Fraunces + DM Sans 字体）。
- **不删除功能**：所有原功能（对话创作、分步工坊、Agent 管理、方案管理、生成进度、健康检测、登录/登出、Hero 介绍、录入表单、结果展示）全部保留。
- **合理分工**：把「全局模式切换」交给顶部导航，把「当前方案/历史/进度」交给左侧边栏，避免功能重复、路由错乱。

## 2. 当前状态分析

### 2.1 已具备的基础

| 文件 | 现状 |
|------|------|
| `frontend/index.html` | 已存在 `<aside class="site-sidebar">` + `<div class="site-body">` 布局；侧边栏包含展开/收起按钮、新建方案、进度、方案列表。 |
| `frontend/assets/css/style.css` | 已有 `--sidebar-collapsed` / `--sidebar-expanded`、`.site-sidebar`、`.site-body` 样式；顶部导航 `.site-header` 样式完整。 |
| `frontend/assets/js/sidebar.js` | 已管理折叠状态、方案列表渲染、当前方案高亮、进度显示。 |
| `frontend/assets/js/router.js` | 已实现 `#/chat`、`#/plan`、`#/agents`、`#/workshop`、`#/about` 路由。 |
| `frontend/assets/js/app.js` | 已调用 `Q.sidebar.showProgress()` / `resetProgress()` / `refresh()` 驱动边栏进度。 |

### 2.2 待修复的关键问题

1. **Hero 区与录入表单不是 `.page-section`**
   - 当前 `hero` 与 `create` 表单直接放在 `<main>` 中，router 只会切换 `.page-section`。
   - 结果：切换「对话创作 / 分步工坊 / Agent 管理」时，Hero 和表单始终堆叠在页面下方，造成重复、混乱。
2. **顶部导航缺少「开始创作」入口**
   - 表单功能没有对应路由，用户无法通过导航直达。
3. **「关于」放在顶部导航意义不大**
   - 点击后只是滚动到页脚；页脚本身已存在，顶部导航可腾出位置给核心功能。
4. **移动端职责可再清晰**
   - 侧边栏已负责方案相关操作；顶部导航应只保留全局入口，减少拥挤。

## 3. 功能布局方案

### 3.1 顶部导航栏（全局模式）

保留现有样式，内容精简为：

```
[品牌 Logo · 青禾映画]    [开始创作] [对话创作] [分步工坊] [Agent 管理]          [健康状态] [登出]
```

- **品牌 Logo**：返回默认首页 `#/create`。
- **开始创作**：对应 Hero + 产品录入表单（新设为 `#/create`）。
- **对话创作**：保留 `#/chat`。
- **分步工坊**：保留 `#/workshop`。
- **Agent 管理**：保留 `#/agents`。
- **健康状态 pill**：保留在右上角。
- **登出按钮**：保留在右上角，未登录时隐藏。

### 3.2 左侧边栏（方案上下文）

侧边栏负责与「当前方案」强相关的操作：

```
[≡ 展开/收起]
[+] 新建方案
─────────────────
生成进度（仅在生成时出现）
─────────────────
我的方案
  A 安岳柠檬
  B 百色芒果
  …
查看全部 →
```

- **展开/收起按钮**：保留，记忆折叠状态。
- **新建方案**：保留，跳转到 `#/chat` 并清空当前对话。
- **生成进度面板**：保留，跟随 SSE 事件实时更新节点状态与进度条。
- **方案历史列表**：保留，点击加载对应方案。
- **查看全部**：跳到 `#/plan`（全屏方案管理页）。

### 3.3 页脚

- 保留「关于」信息、分步工坊链接、说明链接。
- 不再在顶部导航中占用一个 tab。

## 4. 具体改动清单

### 4.1 `frontend/index.html`

1. 将 `hero` 区块与 `create` 表单区块合并为：
   ```html
   <section class="page-section" id="createPage">
     <!-- 原有 hero -->
     <!-- 原有 create 表单 -->
   </section>
   ```
2. 顶部导航 `<nav class="site-nav">` 改为：
   ```html
   <a href="#/create" class="site-nav__link" data-route="create">开始创作</a>
   <a href="#/chat" class="site-nav__link is-active" data-route="chat">对话创作</a>
   <a href="#/workshop" class="site-nav__link" data-route="workshop">分步工坊</a>
   <a href="#/agents" class="site-nav__link" data-route="agents">Agent 管理</a>
   ```
   删除「关于」链接。
3. 其余侧边栏、健康 pill、登出按钮、页脚保持不动。

### 4.2 `frontend/assets/js/router.js`

1. 注册新路由：
   ```js
   register("#/create", function () { showSection("createPage"); });
   ```
2. 修改默认路由：首次无 hash 或 hash 为 `#` 时，跳转到 `#/create`。
   ```js
   if (!hash || hash === "#") {
     window.location.hash = "#/create";
     return;
   }
   ```
3. `updateNavActive` 无需额外改动，`data-route="create"` 会自然匹配。
4. 保留 `#/plan` 路由（由侧边栏「查看全部」进入）。
5. 移除/注释 `#/about` 路由，改为空操作或简单滚动到 footer；footer 已可见，无需特殊处理。

### 4.3 `frontend/assets/css/style.css`

1. 新增/调整 `#createPage` 的显示规则：
   ```css
   #createPage.is-active {
     display: block;
   }
   ```
   （`.page-section.is-active` 已定义，通常足够；显式声明可防覆盖。）
2. 检查 `.site-nav` 在 768px 下的 `overflow-x: auto`，增加一个链接后仍应正常横向滚动。
3. 可选优化：折叠态侧边栏的方案图标仍可点击加载方案。当前 `.site-sidebar.is-collapsed .sidebar__list { pointer-events: none; }` 会让图标也无法点击。若希望折叠态点击图标即可切换方案，去掉该行；若坚持「展开后才可操作」则保留。本方案建议**去掉 `pointer-events: none`**，让折叠态也能快速切换最近方案。

### 4.4 `frontend/assets/js/app.js`

1. 保持 SSE 生成逻辑不变。
2. 生成完成后，若希望用户自动进入结果视图，可追加：
   ```js
   if (Q.router && finalResult) Q.router.navigate("#/create");
   ```
   由于结果区就在 `#createPage` 下方，可保持当前做法（仅 reveal `#result`），不作强跳转。
3. 校验失败时的 `pipeline.setStatus` 会写入边栏状态栏；无额外改动。

### 4.5 其他 JS 模块

- `sidebar.js`：无需改动，已能响应 hash 变化刷新方案高亮。
- `plan.js`：无需改动，删除方案后已调用 `Q.sidebar.refresh()`。
- `chat.js`：无需改动，保存/加载方案后已调用 `Q.sidebar.refresh()`。
- `auth.js`：无需改动，登录遮罩已同步隐藏/显示侧边栏。

## 5. 路由与页面映射（最终）

| Hash | 显示页面区块 | 顶部导航高亮 | 左侧边栏 |
|------|--------------|--------------|----------|
| `#/create`（默认） | `createPage`（Hero + 录入表单） | 开始创作 | 方案列表、新建、进度 |
| `#/chat` | `chatPage` | 对话创作 | 同上 |
| `#/chat?planId=xxx` | `chatPage` 并加载对应方案 | 对话创作 | 高亮对应方案 |
| `#/workshop` | `workshop` | 分步工坊 | 同上 |
| `#/agents` | `agentsPage` | Agent 管理 | 同上 |
| `#/plan` | `planPage`（全屏方案管理） | 不高亮顶部 tab | 同上，且可返回 |

## 6. 设计决策与假设

- **不引入新依赖**：全部使用现有原生 HTML/CSS/JS 与 Qinghe 命名空间。
- **不改动后端**：仅前端路由与布局调整。
- **不改动现有数据结构**：`qinghe_plans`、`qinghe_sidebar_collapsed` 等 localStorage key 保持不变。
- **默认首页选择**：将默认路由从 `#/chat` 改为 `#/create`，让新用户首次进入即看到 Hero 与表单，符合「更简单」的目标；老用户可通过顶部导航或侧边栏继续已有方案。
- **结果展示保留原位**：生成完成后 reveal `#result` 区块，用户滚动即可查看；不强跳新路由，避免打断当前页面上下文。

## 7. 验证步骤

1. **静态测试**
   ```powershell
   cd qinghe-video ; python -m pytest tests/ -v
   ```
   确保后端测试通过（前端布局改动不影响测试，但例行运行）。
2. **本地启动**
   ```powershell
   cd qinghe-video
   uvicorn src.main:app --host 0.0.0.0 --port 18739
   ```
3. **浏览器验证**
   - 打开 `http://localhost:18739/`，应自动跳转到 `#/create`，只显示 Hero + 表单，无对话页内容。
   - 顶部导航「开始创作」高亮，侧边栏默认折叠。
   - 点击侧边栏展开按钮，显示方案列表；点击「新建方案」跳转 `#/chat`。
   - 顶部导航切换「对话创作 / 分步工坊 / Agent 管理」，Hero/表单不再堆叠出现。
   - 在 `#/create` 页填写表单点击生成，侧边栏出现进度；生成完成后 `#result` 区域显示。
   - 缩小窗口到 < 768px，侧边栏变为 overlay；顶部导航横向滚动仍可操作。
4. **功能回归**
   - 登录/登出遮罩仍正确隐藏/显示侧边栏。
   - 已有方案可在侧边栏点击加载，高亮同步。
   - 删除方案后边栏列表刷新。

## 8. 预期效果

- 顶部导航更聚焦：只做「模式切换」，不堆放方案相关操作。
- 左侧边栏成为创作上下文中心：方案历史、新建、进度一目了然。
- 路由与视图一一对应，不再有 Hero/表单在所有页面底部堆叠的错乱感。
- 整体在保留现有主题与关键样式的前提下，信息层级更清晰，移动端也更易用。
