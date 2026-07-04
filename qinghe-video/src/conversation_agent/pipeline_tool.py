"""主流水线调用工具。

真实调用 src.graph.app_graph.invoke(state)，运行青禾映画 5 节点流水线
（planner→copywriter→scriptwriter→visual_designer→distributor→report_generator）。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def run_pipeline(
    product_name: str = "",
    origin: str = "",
    category: str = "",
    selling_points: str = "",
    target_platform: str = "",
    target_duration: str = "",
    additional_info: str = "",
) -> dict[str, Any]:
    """运行主流水线，返回最终 state。

    组装 QingheState 输入字段，调用模块级单例 app_graph.invoke。
    """
    # 延迟导入避免循环依赖（graph.py 导入 nodes，nodes 导入 config）
    from src.graph import app_graph

    state: dict[str, Any] = {
        "product_name": product_name,
        "origin": origin,
        "category": category,
        "selling_points": selling_points,
        "target_platform": target_platform,
        "target_duration": target_duration,
        "additional_info": additional_info,
    }
    logger.info(
        "[run_pipeline] 启动主流水线: product=%s, platform=%s",
        product_name,
        target_platform,
    )
    final_state = app_graph.invoke(state)
    logger.info("[run_pipeline] 流水线完成, error=%s", bool(final_state.get("error")))
    return final_state


def run_pipeline_tool_func(
    product_name: str = "",
    origin: str = "",
    category: str = "",
    selling_points: str = "",
    target_platform: str = "",
    target_duration: str = "",
    additional_info: str = "",
) -> str:
    """工具函数：运行主流水线并返回 Markdown 报告或错误信息。

    供 ReAct 循环调用，输出为字符串供 LLM 阅读。
    """
    try:
        state = run_pipeline(
            product_name=product_name,
            origin=origin,
            category=category,
            selling_points=selling_points,
            target_platform=target_platform,
            target_duration=target_duration,
            additional_info=additional_info,
        )
    except Exception as e:
        logger.exception("[run_pipeline_tool_func] 流水线调用异常")
        return f"主流水线调用失败：{e}"

    if state.get("error"):
        return f"主流水线执行出错：{state['error']}"

    report = state.get("final_report", "")
    if not report:
        return "主流水线执行完成，但未生成报告。"
    return report
