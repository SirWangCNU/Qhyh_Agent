# 侧边栏 UI 重构 + 对话持久化修复 - 实现计划

## [ ] Task 1: 后端 - 自动创建会话并返回 conversation_id
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 `src/conversation_agent/router.py` 的 `chat_stream` 函数：当 `request.conversation_id` 为空时，在流开始前调用 `create_conversation(db, current_user.id, first_message=user_text)` 自动创建新会话，并将 `conversation_id` 设置为新创建的 id。
  - 确保无论 conversation_id 是前端传入还是后端自动创建，都在 `done` 事件 data 中携带 `conversation_id`（当前只在 conversation_id 存在时才追加，需要改为始终追加）。
  - 同步修复 `chat_sync` 端点的相同逻辑（conversation_id 为空时自动创建）。
  - 在 `_persist_round` 中确保自动创建的 conversation_id 也能正确落库。
- **Acceptance Criteria Addressed**: AC-3, AC-5
- **Test Requirements**:
  - `programmatic` TR-1.1: 不带 conversation_id 调用 POST /api/conversation/chat，SSE done 事件中包含有效的 conversation_id
  - `programmatic` TR-1.2: 自动创建的会话在数据库中存在，标题为首条用户消息前30字
  - `programmatic` TR-1.3: 流结束后 conversation_messages 表中有对应的 user 和 assistant 消息
  - `programmatic` TR-1.4: 后端现有测试全部通过（pytest）
- **Notes**: 需要导入 `create_conversation` from persistence.py；注意 SSE 是 generator，db session 在 generator 中的生命周期问题（当前代码中 db 是依赖注入的，在 StreamingResponse 返回后仍可使用，因为 FastAPI 会在响应完成后才清理）。

## [ ] Task 2: 前端 - 修复 useConversation 闭包 bug，处理 conversation_id 回写
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 修改 `frontend/src/hooks/use-conversation.ts`：
    - 将 `conversationId` 同时存储在 `useRef` 中（`conversationIdRef`），避免 useCallback 闭包陷阱。
    - `setConversationId` 同时更新 state 和 ref。
    - `sendMessage` 中读取 `conversationIdRef.current` 而非闭包中的 `conversationId`，确保获取最新值。
    - 解析 SSE 事件时，监听 `done` 事件 data 中的 `conversation_id`：如果当前 conversationId 为空但返回了新的 id，调用 `setConversationId` 更新状态和 ref。
  - 修改 `frontend/src/pages/ChatPage.tsx`：
    - 简化 `ensureConversationAndSend`：移除预创建会话的逻辑（不再调用 `createConversation.mutateAsync`），直接调用 `conversation.sendMessage(text)` 即可，后端会自动创建。
    - 监听 `conversation.conversationId` 变化，当它从 null 变为有值时（即后端自动创建后返回），更新 URL search params（`setSearchParams({ conversationId: newId })`）。
    - 保留 `handleNewConversation` 中的 reset 逻辑，但无需预创建。
  - 修改 `SidebarNewPlan.tsx`：新建对话时直接导航到 `/chat`（不带 conversationId），让后端在第一次发送时自动创建，而不是前端调用创建 API。
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-2.1: npx tsc --noEmit 无类型错误
  - `human-judgement` TR-2.2: 新对话发送消息后，URL 自动更新为 ?conversationId=xxx
  - `human-judgement` TR-2.3: 刷新页面后历史消息正确加载
- **Notes**: 保留 `useCreateConversation` hook 可能仍有用（比如 SidebarNewPlan 可以选择保留预创建以立即获得 id），但核心发送流程不再依赖预创建。建议 SidebarNewPlan 也改为直接导航到空 /chat，简化逻辑。

## [ ] Task 3: 侧边栏整体布局与视觉重构
- **Priority**: high
- **Depends On**: None (可与 Task 1/2 并行)
- **Description**:
  - 修改 `frontend/src/components/layout/Sidebar.tsx`：
    - 调整背景色为更温暖的色调（与整体 cream/warm 风格一致，如 `bg-[#faf6ee]` 或带微妙渐变）。
    - 优化内边距，去掉不必要的顶部空白。
    - 调整 flex 布局：SidebarHeader 更紧凑，SidebarNewPlan 更精致，对话历史和工坊记录之间有优雅的分隔。
  - 修改 `frontend/src/components/layout/SidebarHeader.tsx`：
    - 减小头部高度（从 h-12 到更紧凑）。
    - 折叠按钮样式改为更轻量的设计（不要太显眼，融入背景）。
    - 移除旋转动画中的三条杠大图标感觉，使用更精致的菜单图标。
  - 修改 `frontend/src/components/layout/SidebarNewPlan.tsx`：
    - 按钮改为更符合杂志风格的样式：圆角更大、背景更柔和、hover 时有橄榄绿淡色背景、+ 号更精致。
    - 移除边框感或使用更淡的边框。
    - 文字字重适中，不要太粗。
- **Acceptance Criteria Addressed**: AC-1, AC-6
- **Test Requirements**:
  - `programmatic` TR-3.1: npx tsc --noEmit 无错误
  - `human-judgement` TR-3.2: 侧边栏顶部不再有突兀的三条杠大图标
  - `human-judgement` TR-3.3: 新建对话按钮样式精致、与整体风格协调
  - `human-judgement` TR-3.4: 折叠状态下按钮显示正常（仅图标）
- **Notes**: 使用现有的 CSS 变量和 Tailwind 类，保持温暖自然杂志风格（奶油色背景、橄榄绿品牌色、金色点缀）。

## [ ] Task 4: SidebarPlanList 视觉重构 + 删除功能 + 空状态
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 修改 `frontend/src/components/layout/SidebarPlanList.tsx`：
    - 重构列表项样式：首字图标从简单圆形改为带橄榄绿淡色背景的圆形，选中时用品牌色背景+白色文字。
    - 标题字体从 text-xs 调整为 text-[13px]，更易读。
    - 副标题（时间）字体颜色更柔和（text-ink-faint 保持但字重更轻）。
    - 添加 hover 删除按钮（参考 SidebarWorkshopList 的实现，group-hover 显示 Trash2 图标）。
    - 引入 `useDeleteConversation` hook，实现删除功能（点击删除按钮→确认→调用 mutate→删除后如果是当前会话则导航到 /chat）。
    - 优化空状态：不再显示"暂无对话"的灰色文字，改为更友好的提示（如带小图标和引导文字"开始新对话吧"）。
    - 列表项间距、padding、圆角调整为更精致的杂志风格（圆角稍大、padding 稍大、选中状态有微妙的左侧边线或背景）。
    - 折叠状态下只显示圆形首字图标。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-6
- **Test Requirements**:
  - `programmatic` TR-4.1: npx tsc --noEmit 无错误
  - `human-judgement` TR-4.2: 列表项视觉精致，首字图标、标题、时间层次分明
  - `human-judgement` TR-4.3: hover 时显示删除按钮，点击可删除会话
  - `human-judgement` TR-4.4: 删除当前会话后正确跳转到空对话页
  - `human-judgement` TR-4.5: 空状态提示友好
  - `human-judgement` TR-4.6: 折叠状态正常显示首字图标

## [ ] Task 5: SidebarWorkshopList 视觉对齐
- **Priority**: medium
- **Depends On**: Task 3, Task 4
- **Description**:
  - 修改 `frontend/src/components/layout/SidebarWorkshopList.tsx`：
    - 将列表项样式调整为与 SidebarPlanList 一致（首字图标样式、字体大小、圆角、padding、hover 效果统一）。
    - 分组标题（"工坊记录"）与"对话历史"标题样式统一。
    - 两个分组之间添加微妙的分隔线或间距区分。
    - 保持 max-h-[40vh] 限制，但确保两个列表都能正确滚动。
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-5.1: npx tsc --noEmit 无错误
  - `human-judgement` TR-5.2: 对话历史和工坊记录视觉风格统一
  - `human-judgement` TR-5.3: 工坊记录原有功能（点击跳转、删除、进度显示）正常
- **Notes**: 工坊记录的"工"字图标和对话记录的首字图标使用统一的圆形样式，但可以通过颜色微调区分（如工坊用稍微不同的色调）。

## [ ] Task 6: 端到端验证
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3, Task 4, Task 5
- **Description**:
  - 运行 TypeScript 类型检查确保无错误。
  - 运行后端 pytest 确保所有测试通过。
  - 启动前后端，手动验证完整流程：
    1. 新用户（或清空状态后）打开对话页，发送一条消息。
    2. 观察 SSE 流正常返回，回答正常显示。
    3. 展开侧边栏，确认对话历史中出现新记录。
    4. 刷新页面，确认记录仍然存在，点击记录能加载历史。
    5. 继续发送多轮消息，确认都追加到同一会话。
    6. 测试删除对话记录功能。
    7. 测试折叠/展开侧边栏。
    8. 测试工坊记录视觉是否正常。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
- **Test Requirements**:
  - `programmatic` TR-6.1: npx tsc --noEmit 退出码为 0
  - `programmatic` TR-6.2: pytest tests/ 退出码为 0（167+ tests passed）
  - `human-judgement` TR-6.3: 侧边栏视觉美观，符合温暖杂志风格
  - `human-judgement` TR-6.4: 首次对话后记录正确保存并显示
  - `human-judgement` TR-6.5: URL 正确更新
  - `human-judgement` TR-6.6: 多轮对话、删除、折叠等功能正常
