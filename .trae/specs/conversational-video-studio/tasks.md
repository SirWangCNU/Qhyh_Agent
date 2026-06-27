# Tasks

- [x] Task 1: 创建前端路由系统
  - [x] SubTask 1.1: 新建 `assets/js/router.js`，基于 `location.hash` 切换 page section
  - [x] SubTask 1.2: 定义页面 ID：`chatPage`、`planPage`、`agentsPage`，并保留现有 `workshop`、`pipeline` 等
  - [x] SubTask 1.3: 实现 `router.navigate(hash)` 与 `hashchange` 监听
  - [x] SubTask 1.4: 在 `index.html` 底部引入 `router.js`

- [x] Task 2: 改造主导航
  - [x] SubTask 2.1: 在 `index.html` 顶部导航新增「对话创作」「规划设计」「Agent 管理」入口
  - [x] SubTask 2.2: 链接指向 `#/chat`、`#/plan`、`#/agents`
  - [x] SubTask 2.3: 当前页面高亮对应导航项
  - [x] SubTask 2.4: 调整 `style.css` 导航样式，确保 5-6 个入口在桌面/移动端均不溢出

- [x] Task 3: 设计并实现对话式创作页面（#/chat）
  - [x] SubTask 3.1: 在 `index.html` 新增 `<section id="chatPage">` 容器
  - [x] SubTask 3.2: 新建 `assets/css/chat.css`：对话气泡（用户右对齐、助手左对齐）、输入框固定在底部、欢迎语样式
  - [x] SubTask 3.3: 新建 `assets/js/chat.js`：
    - 维护 `chatHistory` 数组（role/content + 产物数据）
    - 渲染消息气泡与快捷提示按钮
    - 解析用户输入为 `UserInput` 结构，调用 `POST /api/generate/stream` 或分步 Agent
    - 在流式消息中渲染每个 Agent 产物卡片（复用 `agent-renderers.js`）
    - 支持「一键成片」按钮，调用 `POST /api/video/mvp`
    - 支持多轮追问：追加到 `chatHistory` 并重新调用相关 Agent
  - [x] SubTask 3.4: 将对话状态保存到 `localStorage`，支持 `?planId=xxx` 恢复

- [x] Task 4: 设计并实现规划设计页面（#/plan）
  - [x] SubTask 4.1: 在 `index.html` 新增 `<section id="planPage">` 容器
  - [x] SubTask 4.2: 新建 `assets/css/plan.css`：项目卡片网格、空态、操作按钮
  - [x] SubTask 4.3: 新建 `assets/js/plan.js`：
    - 从 `localStorage` 读取方案列表
    - 展示方案名称、创建时间、进度、最后一条消息摘要
    - 「新建方案」跳转 `#/chat`
    - 「继续」跳转 `#/chat?planId=xxx`
    - 「删除」移除 localStorage 数据并刷新列表
  - [x] SubTask 4.4: 在 `chat.js` 中保存新方案时写入 localStorage

- [x] Task 5: 设计并实现 Agent 管理页面（#/agents）
  - [x] SubTask 5.1: 在 `index.html` 新增 `<section id="agentsPage">` 容器
  - [x] SubTask 5.2: 新建 `assets/css/agents.css`：Agent 卡片网格、状态徽章、产物展示区
  - [x] SubTask 5.3: 新建 `assets/js/agents.js`：
    - 定义 6 个 Agent 元数据（与 `workshop.js` STEPS 对齐）
    - 渲染 Agent 卡片网格，显示名称、描述、最近状态
    - 点击卡片右侧展开输入区（复用顶部农产品表单）与产物区
    - 调用 `POST /api/agents/{step}`，用 `agent-renderers.js` 渲染产物
    - 显示 loading / success / error 状态徽章
  - [x] SubTask 5.4: 支持在 Agent 页面直接跳转到分步工坊对应步骤

- [x] Task 6: 后端路由兼容（可选但推荐）
  - [x] SubTask 6.1: 在 `src/main.py` 新增 `/chat`、`/plan`、`/agents` 路由，均返回同一 `index.html`
  - [x] SubTask 6.2: 验证直接访问 `http://localhost:18739/chat` 也能正确渲染

- [ ] Task 7: 端到端验证
  - [ ] SubTask 7.1: 运行 `pytest tests/ -v` 确保无回归
  - [ ] SubTask 7.2: 启动后端，验证导航可切换到对话创作 / 规划设计 / Agent 管理
  - [ ] SubTask 7.3: 在 `#/chat` 发送一条农产品需求，验证气泡对话与 Agent 产物展示
  - [ ] SubTask 7.4: 在 `#/plan` 验证方案列表、新建、继续、删除
  - [ ] SubTask 7.5: 在 `#/agents` 验证单 Agent 调用与产物展示

# Task Dependencies

- [Task 1] 必须在 [Task 2] [Task 3] [Task 4] [Task 5] 之前完成
- [Task 2] 必须在 [Task 7] 之前完成
- [Task 3] 和 [Task 4] 可并行
- [Task 5] 可与 [Task 3] [Task 4] 并行
- [Task 6] 是可选依赖，可在任意前端任务完成后进行
- [Task 7] 依赖全部实现任务
