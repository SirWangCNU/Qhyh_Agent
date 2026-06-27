# Checklist

## 前端路由
- [ ] `assets/js/router.js` 存在且基于 `location.hash` 实现路由切换
- [ ] `index.html` 中已引入 `router.js`
- [ ] 访问 `/#/chat`、`#/plan`、`#/agents`、`#/workshop` 均能正确显示对应 section
- [ ] 点击顶部导航切换页面无刷新

## 导航
- [ ] 顶部导航新增「对话创作」「规划设计」「Agent 管理」入口
- [ ] 导航链接指向正确的 hash 路由
- [ ] 当前页面对应导航项高亮
- [ ] 桌面端与移动端导航均不溢出或可使用汉堡菜单

## 对话式创作页面（#/chat）
- [ ] `chatPage` section 存在且默认显示欢迎语与快捷提示按钮
- [ ] 用户消息气泡右对齐，助手消息气泡左对齐
- [ ] 输入框固定在页面底部，支持回车发送
- [ ] 发送后调用后端（SSE 或非流式）并展示 Agent 产物卡片
- [ ] 产物卡片复用 `agent-renderers.js` 的结构化渲染
- [ ] 支持「一键成片」按钮，调用 `POST /api/video/mvp` 并展示视频播放器
- [ ] 支持多轮追问，上下文不丢失
- [ ] 对话状态保存到 `localStorage`，支持 `?planId=xxx` 恢复
- [ ] `assets/css/chat.css` 样式符合整体农业有机风

## 规划设计页面（#/plan）
- [ ] `planPage` section 存在
- [ ] 展示 localStorage 中保存的方案列表
- [ ] 每个方案卡片显示名称、创建时间、进度、最后消息摘要
- [ ] 「新建方案」跳转 `#/chat`
- [ ] 「继续」跳转 `#/chat?planId=xxx`
- [ ] 「删除」移除方案并刷新列表
- [ ] 空态页面提示用户新建方案
- [ ] `assets/css/plan.css` 样式符合整体农业有机风

## Agent 管理页面（#/agents）
- [ ] `agentsPage` section 存在
- [ ] 以卡片网格展示 6 个 Agent
- [ ] 每个 Agent 卡片显示头像、名称、描述、最近状态徽章
- [ ] 点击卡片展开输入区与产物区
- [ ] 支持调用 `POST /api/agents/{step}`
- [ ] 产物用 `agent-renderers.js` 结构化展示
- [ ] loading / success / error 状态清晰可见
- [ ] 支持跳转到分步工坊对应步骤
- [ ] `assets/css/agents.css` 样式符合整体农业有机风

## 后端兼容性
- [ ] `/chat`、`/plan`、`/agents` 路由返回同一 `index.html`（可选）

## 端到端验证
- [ ] `pytest tests/ -v` 无回归
- [ ] 浏览器中可完成从导航到对话、规划、Agent 管理的完整流程
- [ ] 无 JavaScript 控制台报错
