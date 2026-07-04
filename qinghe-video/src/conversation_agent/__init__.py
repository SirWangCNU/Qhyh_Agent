"""对话创作 Agent 模块。

独立的 ReAct 对话 agent，支持联网搜索（DuckDuckGo）+ 主流水线调用 + 媒体生成（mock）。
刻意不导入 router（遵循 canvas 模式，避免 alembic env.py 加载 ORM 时触发 FastAPI 依赖链）；
main.py 用 `from src.conversation_agent.router import router` 显式导入。

用法示例：

    from src.conversation_agent import (
        run_conversation,
        ConversationRequest,
        ConversationMessage,
    )

    resp = run_conversation(
        ConversationRequest(
            messages=[
                ConversationMessage(role="user", content="帮我创作一个五常大米短视频")
            ]
        )
    )
    print(resp.answer)
    for ev in resp.events:
        print(ev.event, ev.data)
"""

from src.conversation_agent.models import (
    ConversationEvent,
    ConversationMessage,
    ConversationRequest,
    ConversationResponse,
)
from src.conversation_agent.service import run_conversation, run_conversation_stream

__all__ = [
    "run_conversation",
    "run_conversation_stream",
    "ConversationRequest",
    "ConversationResponse",
    "ConversationMessage",
    "ConversationEvent",
]
