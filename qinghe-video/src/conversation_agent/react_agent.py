"""ReAct 循环核心：自主思考 → 工具调用 → 观察 → 再思考。

基于 ChatOpenAI.bind_tools() 实现，以生成器方式逐事件 yield，支持真正的流式输出。
单工具失败不中断循环（错误写回 ToolMessage 让 LLM 自行处理）；LLM 调用失败抛出。
纯函数，可被任何脚本调用。
"""

from __future__ import annotations

import logging
from typing import Any, Generator

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage

from src.conversation_agent.tools import execute_tool

logger = logging.getLogger(__name__)

# 达到最大迭代时的提示
_MAX_ITER_NOTICE = "（已达最大迭代数，强制终止循环）"


def react_loop(
    llm: Any,
    messages: list[BaseMessage],
    tools_schema: list[dict[str, Any]],
    max_iterations: int,
) -> Generator[dict[str, Any], None, None]:
    """ReAct 循环生成器。

    逐个 yield 事件 dict：
        {"type": "think", "iteration": int, "content": str}
        {"type": "tool_call", "iteration": int, "name": str, "args": dict}
        {"type": "tool_result", "iteration": int, "name": str, "output": str, "success": bool}
        {"type": "final", "answer": str, "iterations": int}  # 最后一个事件

    Args:
        llm: ChatOpenAI 实例（将调用其 bind_tools）。
        messages: 初始消息列表（含 system + 历史），循环会就地追加。
        tools_schema: OpenAI function calling 格式的工具 schema 列表。
        max_iterations: 最大迭代次数。

    Yields:
        dict: 事件。
    """
    bound_llm = llm.bind_tools(tools_schema)
    content = ""
    iterations_used = 0

    for iteration in range(1, max_iterations + 1):
        iterations_used = iteration
        logger.info("[react] 迭代 %d/%d", iteration, max_iterations)
        ai_msg: AIMessage = bound_llm.invoke(messages)
        messages.append(ai_msg)

        content = ai_msg.content if isinstance(ai_msg.content, str) else str(ai_msg.content)
        tool_calls = getattr(ai_msg, "tool_calls", None) or []

        # 思考文本（非空才输出）
        if content:
            yield {"type": "think", "iteration": iteration, "content": content}

        # 无工具调用 → 循环结束
        if not tool_calls:
            logger.info("[react] 无工具调用，循环结束，迭代 %d", iteration)
            yield {"type": "final", "answer": content, "iterations": iteration}
            return

        # 执行所有工具调用
        for tc in tool_calls:
            tool_name = tc.get("name", "")
            tool_args = tc.get("args", {}) or {}
            tool_id = tc.get("id", "")

            yield {
                "type": "tool_call",
                "iteration": iteration,
                "name": tool_name,
                "args": tool_args,
            }
            logger.info("[react] 调用工具: %s, args=%s", tool_name, tool_args)

            result = execute_tool(tool_name, tool_args)
            yield {
                "type": "tool_result",
                "iteration": iteration,
                "name": tool_name,
                "output": result.output,
                "success": result.success,
            }

            # 工具结果回填为 ToolMessage，让 LLM 在下一轮看到
            messages.append(ToolMessage(content=result.output, tool_call_id=tool_id))

    # 达到最大迭代仍有工具调用 → 强制终止
    logger.warning("[react] 达到最大迭代 %d，强制终止", max_iterations)
    final_answer = (content or "（无文本输出）") + _MAX_ITER_NOTICE
    yield {"type": "final", "answer": final_answer, "iterations": iterations_used}
