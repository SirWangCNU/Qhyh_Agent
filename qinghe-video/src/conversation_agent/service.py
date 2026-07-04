"""对话创作 Agent 对外服务函数。

提供同步执行 run_conversation() 和流式生成器 run_conversation_stream()。
两者共享消息预处理、LLM 构建与 react_loop 生成器。不依赖 FastAPI，可被任何脚本调用。
"""

from __future__ import annotations

import logging
from typing import Any, Generator

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from src.config import settings
from src.conversation_agent.models import (
    ConversationEvent,
    ConversationMessage,
    ConversationRequest,
    ConversationResponse,
)
from src.conversation_agent.prompts import CONVERSATION_AGENT_SYSTEM_PROMPT
from src.conversation_agent.react_agent import react_loop
from src.conversation_agent.tools import get_tool_schemas
from src.nodes.llm import get_llm

logger = logging.getLogger(__name__)


def _prepare_messages(messages: list[ConversationMessage]) -> list[BaseMessage]:
    """把 ConversationMessage 列表转为 LangChain 消息列表，头部插入 system prompt。"""
    result: list[BaseMessage] = [SystemMessage(content=CONVERSATION_AGENT_SYSTEM_PROMPT)]
    for m in messages:
        if m.role == "user":
            result.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            result.append(AIMessage(content=m.content, tool_calls=m.tool_calls or []))
        elif m.role == "tool":
            result.append(ToolMessage(content=m.content, tool_call_id=m.tool_call_id or ""))
    return result


def _build_llm() -> Any:
    """创建对话 agent 专用 LLM 实例。"""
    return get_llm(temperature=settings.CONVERSATION_AGENT_TEMPERATURE)


def _resolve_max_iterations(request: ConversationRequest) -> int:
    """解析最大迭代数：request 优先，否则取配置默认。"""
    if request.max_iterations is not None:
        return request.max_iterations
    return settings.CONVERSATION_AGENT_MAX_ITERATIONS


def _iter_events(request: ConversationRequest) -> Generator[ConversationEvent, None, None]:
    """共享事件生成器：驱动 react_loop，把原始事件映射为 ConversationEvent。

    react_loop 的 "final" 事件映射为 "answer" + "done" 两个事件。
    """
    messages = _prepare_messages(request.messages)
    llm = _build_llm()
    tools_schema = get_tool_schemas()
    max_iter = _resolve_max_iterations(request)

    logger.info(
        "[conversation] 启动 agent，max_iter=%d, 消息数=%d",
        max_iter,
        len(request.messages),
    )
    for event in react_loop(llm, messages, tools_schema, max_iter):
        etype = event.get("type", "")
        if etype == "final":
            yield ConversationEvent(
                event="answer", data={"answer": event.get("answer", "")}
            )
            yield ConversationEvent(
                event="done", data={"iterations": event.get("iterations", 0)}
            )
        else:
            # think / tool_call / tool_result：去掉 type 字段后作为 data
            data = {k: v for k, v in event.items() if k != "type"}
            yield ConversationEvent(event=etype, data=data)


def run_conversation(request: ConversationRequest) -> ConversationResponse:
    """同步执行对话创作 agent，返回完整响应（含所有事件）。"""
    events: list[ConversationEvent] = []
    answer = ""
    iterations = 0
    for ev in _iter_events(request):
        events.append(ev)
        if ev.event == "answer":
            answer = ev.data.get("answer", "")
        elif ev.event == "done":
            iterations = ev.data.get("iterations", 0)
    logger.info(
        "[run_conversation] 完成，answer_len=%d, iterations=%d",
        len(answer),
        iterations,
    )
    return ConversationResponse(answer=answer, events=events, iterations=iterations)


def run_conversation_stream(
    request: ConversationRequest,
) -> Generator[ConversationEvent, None, None]:
    """流式执行对话创作 agent，逐事件 yield（供 SSE 端点）。"""
    yield from _iter_events(request)
