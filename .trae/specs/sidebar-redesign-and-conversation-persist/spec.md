# 侧边栏对话历史 UI 重构 + 对话记录持久化修复 - PRD

## Overview
- **Summary**: 重新设计左侧边栏的对话历史/工坊记录区域的视觉布局，使其更符合「温暖自然·杂志编辑感」的整体设计风格；同时修复对话创作完成后历史记录不显示的 bug（对话消息未落库）。
- **Purpose**: 
  1. 侧边栏当前布局简陋（截图中可见顶部有多余的三条杠图标、"新建对话"按钮与"对话历史"标题间距过大、文字过小、空状态提示不友好、工坊记录列表与对话记录视觉层级混乱），需要重新设计以匹配整体温暖自然的杂志编辑风格。
  2. 用户在 ChatPage 发送消息后，后端没有保存对话记录，导致侧边栏始终显示"暂无对话"，工坊记录正常但对话记录为空。
- **Target Users**: 使用「青禾映画」平台进行农业短视频创作的农户、合作社运营人员。

## Goals
- 重新设计侧边栏视觉：去掉顶部多余的三条杠图标区域，优化"新建对话"按钮样式，改善对话历史和工坊记录的列表项视觉（图标、间距、hover效果、选中状态），统一字体大小和颜色层次，添加删除功能（对话历史目前缺少删除按钮）。
- 修复对话记录持久化 bug：确保 ChatPage 首次发送消息时 conversationId 正确传递到后端，消息能够落库并在侧边栏实时显示。
- 后端在 conversation_id 为空时自动创建会话，无需前端先调用创建 API，简化前端逻辑，减少因异步状态导致的 bug。

## Non-Goals (Out of Scope)
- 不修改侧边栏的折叠/展开交互逻辑和动画。
- 不修改工坊记录（WorkshopList）的数据获取和功能（仅做视觉对齐）。
- 不修改对话 Agent 的核心 ReAct 逻辑、SSE 流处理。
- 不添加对话搜索、标签分组等高级功能。

## Background & Context
- 项目整体视觉方向是「温暖自然·杂志编辑感」：深橄榄绿为品牌锚点，金色为高光，奶油色与暖米色构成层次。
- 侧边栏当前使用 280px 宽度、`bg-bg-alt` 背景、简单的列表样式，与整体温暖杂志风格不匹配。
- 对话持久化 bug 根因：`useConversation.sendMessage` 的 useCallback 闭包捕获了 `conversationId` 状态，当 `ensureConversationAndSend` 中先 `setConversationId(conv.id)` 再调用 `sendMessage(text)` 时，由于 React 状态更新是异步的，sendMessage 内部的 `conversationId` 仍为 `null`，导致请求体不携带 `conversation_id`，后端 `_persist_round` 因 `conversation_id` 为空而跳过落库。
- 工坊记录正常工作是因为 WorkshopPage 的 sessionId 是通过 URL 参数传入的，在组件挂载时就已经确定，不存在异步状态问题。

## Functional Requirements
- **FR-1**: 侧边栏视觉重构 - 移除顶部多余的三条杠折叠图标区域（折叠/展开按钮保留在 SidebarHeader 中但重新设计），重新设计"新建对话"按钮样式使其更符合杂志风格，统一对话历史和工坊记录的列表项样式（首字圆形图标、标题、时间/进度副文字、选中高亮、hover 效果、删除按钮）。
- **FR-2**: 对话历史列表项添加删除按钮（与工坊记录一致，hover 时显示红色垃圾桶图标，点击确认后删除）。
- **FR-3**: 修复对话持久化 bug - 后端 `POST /api/conversation/chat` 在 `conversation_id` 为空时自动创建新会话，并在 SSE `done` 事件 data 中返回新创建的 `conversation_id`；前端收到后回写到 conversation 状态和 URL。
- **FR-4**: 前端 `useConversation` hook 改为不依赖闭包中的 `conversationId` 状态，而是使用 ref 确保发送消息时能获取到最新值；或简化为不预先创建会话，让后端自动创建。
- **FR-5**: 空状态优化 - 对话历史为空时显示更友好的提示（而非简单的"暂无对话"）。

## Non-Functional Requirements
- **NFR-1**: 视觉一致性：侧边栏样式必须与 ChatPage、整体 warm magazine 风格协调（颜色、字体、圆角、阴影、间距）。
- **NFR-2**: 性能：列表渲染使用虚拟滚动不必要（记录通常 <50 条），保持现有 AnimatePresence 动画即可。
- **NFR-3**: 可靠性：对话记录 100% 落库，不再出现"对话了但侧边栏没有记录"的情况。
- **NFR-4**: 兼容性：折叠状态（collapsed=true，64px 宽度）下的样式必须保持正常（仅显示图标）。

## Constraints
- **Technical**: 前端 React + TypeScript + Tailwind + framer-motion；后端 FastAPI + SQLAlchemy + SQLite。
- **Dependencies**: 复用现有的 react-query 模式（useConversationSessions, useDeleteConversation）；复用现有 persistence 层的 create_conversation / append_message 函数。
- **Style**: 继续使用项目已有的 CSS 变量（--color-brand, --color-accent, --color-ink 等），不引入新颜色。

## Assumptions
- 后端自动创建会话时，标题使用首条用户消息的前 30 字（与现有 `_default_title` 逻辑一致）。
- 前端从 SSE `done` 事件中获取 `conversation_id` 后，需要更新 URL search params 以便刷新页面后能正确加载历史。
- SidebarPlanList 和 SidebarWorkshopList 可以共享视觉样式但保持独立数据源。

## Acceptance Criteria

### AC-1: 侧边栏视觉符合温暖杂志风格
- **Given**: 用户登录并展开侧边栏
- **When**: 查看侧边栏
- **Then**: 顶部没有突兀的三条杠大图标；新建对话按钮样式精致（带边框、hover 效果、圆角适中）；对话历史和工坊记录的列表项首字图标为圆形橄榄绿/米色背景，标题字体清晰，副标题（时间/进度）字体较小颜色较浅；选中项有橄榄绿高亮；hover 时有微妙的背景变化和缩放效果；整体间距舒适，不拥挤也不空旷
- **Verification**: `human-judgment`

### AC-2: 对话历史列表项支持删除
- **Given**: 侧边栏中有对话历史记录
- **When**: 用户 hover 到某条对话记录上
- **Then**: 右侧显示红色垃圾桶删除按钮；点击弹出确认框，确认后记录被删除，列表实时更新
- **Verification**: `programmatic` + `human-judgment`

### AC-3: 首次对话自动保存，侧边栏实时显示
- **Given**: 用户在 ChatPage（无 conversationId 参数，即新对话状态）输入消息并发送
- **When**: 对话完成（SSE done 事件到达）
- **Then**: 侧边栏对话历史列表中出现该对话，标题为用户首条消息的前 30 字；刷新页面后该记录仍然存在；点击该记录能正确加载历史消息
- **Verification**: `programmatic`

### AC-4: URL 正确更新 conversationId
- **Given**: 用户在 ChatPage 新对话中发送消息
- **When**: 后端返回 conversation_id（通过 SSE done 事件）
- **Then**: 浏览器 URL 更新为 `/#/chat?conversationId=xxx`，无需刷新页面
- **Verification**: `programmatic` + `human-judgment`

### AC-5: 多轮对话记录正确追加
- **Given**: 用户在一个已有会话中继续发送消息
- **When**: 多轮对话完成
- **Then**: 所有消息都追加到同一会话中，message_count 正确递增，侧边栏时间更新
- **Verification**: `programmatic`

### AC-6: 折叠状态正常
- **Given**: 侧边栏处于折叠状态（64px 宽度）
- **When**: 查看侧边栏
- **Then**: 只显示首字圆形图标，不显示文字；新建对话按钮只显示 + 图标；点击正常工作
- **Verification**: `human-judgment`

### AC-7: TypeScript 类型检查通过，后端测试通过
- **Given**: 所有改动完成
- **When**: 运行 npx tsc --noEmit 和 pytest tests/
- **Then**: 无类型错误，所有测试通过
- **Verification**: `programmatic`

## Open Questions
- 无（技术方案已明确：后端自动创建会话 + SSE 返回 conversation_id + 前端 ref 修复闭包问题 + 视觉重构）
