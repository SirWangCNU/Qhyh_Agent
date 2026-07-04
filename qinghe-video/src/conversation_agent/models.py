"""对话创作 Agent 的 Pydantic 数据模型。

定义请求/响应/事件/工具结果的统一数据结构，
供 service / router / 测试层使用。所有模型严格禁止额外字段。
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# 对话角色
ConversationRole = Literal["user", "assistant", "tool"]

# SSE 事件类型
EventType = Literal["think", "tool_call", "tool_result", "answer", "error", "done"]


class ConversationMessage(BaseModel):
    """对话消息（兼容 OpenAI 风格的多轮对话）。"""

    model_config = ConfigDict(extra="forbid")

    role: ConversationRole
    content: str
    # assistant 消息可能携带 tool_calls；tool 消息携带 tool_call_id
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None


class ConversationRequest(BaseModel):
    """对话创作 Agent 请求。"""

    model_config = ConfigDict(extra="forbid")

    messages: list[ConversationMessage] = Field(..., min_length=1)
    # 覆盖默认最大迭代数；不传则取 settings.CONVERSATION_AGENT_MAX_ITERATIONS
    max_iterations: int | None = None
    # 可选：指定要落库的对话会话 ID。为空时保持无状态（向后兼容）
    conversation_id: str | None = None


class ConversationEvent(BaseModel):
    """SSE 事件统一模型。"""

    model_config = ConfigDict(extra="forbid")

    event: EventType
    data: dict[str, Any]


class ConversationResponse(BaseModel):
    """对话创作 Agent 同步响应。"""

    model_config = ConfigDict(extra="forbid")

    answer: str
    events: list[ConversationEvent]
    iterations: int
    conversation_id: Optional[str] = None


class ToolResult(BaseModel):
    """工具执行结果（内部使用）。"""

    model_config = ConfigDict(extra="forbid")

    name: str
    output: str
    success: bool
