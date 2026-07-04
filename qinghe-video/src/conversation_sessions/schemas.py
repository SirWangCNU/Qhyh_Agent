"""对话创作会话 Pydantic 模型。

与 conversation_sessions/persistence.py 的 ORM 行对应，
供 router 层做请求校验与响应序列化。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

MessageRole = Literal["user", "assistant"]
MessageType = Literal["text", "react"]


class ConversationCreateRequest(BaseModel):
    """创建对话会话请求。"""

    title: str | None = Field(None, max_length=200, description="会话标题")
    first_message: str | None = Field(None, description="首条用户消息，用于生成默认标题")


class MessageCreateRequest(BaseModel):
    """追加消息请求。"""

    role: MessageRole = Field(..., description="消息角色")
    type: MessageType = Field("text", description="消息类型")
    content: str = Field("", description="消息正文")
    meta_json: dict[str, Any] | None = Field(None, description="结构化元数据（ReAct events 等）")
    iterations: int | None = Field(None, description="assistant 完成时的迭代数（可选）")


class RenameRequest(BaseModel):
    """重命名会话请求。"""

    title: str = Field(..., min_length=1, max_length=200, description="新标题")


class ConversationMessageDTO(BaseModel):
    """单条消息响应。"""

    id: str
    conversation_id: str
    seq: int
    role: str
    type: str
    content: str
    meta_json: dict[str, Any] | None = None
    created_at: datetime

    class ConfigDict:
        from_attributes = True


class ConversationSummaryDTO(BaseModel):
    """会话列表项（不含消息明细）。"""

    id: str
    title: str
    summary: str | None = None
    iterations: int
    message_count: int
    created_at: datetime
    updated_at: datetime

    class ConfigDict:
        from_attributes = True


class ConversationDetailDTO(ConversationSummaryDTO):
    """会话详情（含全部消息）。"""

    messages: list[ConversationMessageDTO]


class ConversationListResponse(BaseModel):
    """会话列表分页响应。"""

    items: list[ConversationSummaryDTO]
    total: int
    page: int
    page_size: int
