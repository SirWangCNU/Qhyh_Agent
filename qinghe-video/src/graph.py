"""LangGraph 图定义。

构建青禾映画多 Agent 流水线：
planner -> copywriter -> scriptwriter -> visual_designer -> distributor -> report_generator
"""

from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph

from src.nodes.copywriter import copywriter_node
from src.nodes.distributor import distributor_node
from src.nodes.planner import planner_node
from src.nodes.report_generator import report_generator_node
from src.nodes.scriptwriter import scriptwriter_node
from src.nodes.visual_designer import visual_designer_node
from src.state import QingheState

logger = logging.getLogger(__name__)

# 节点名称常量
PLANNER = "planner"
COPYWRITER = "copywriter"
SCRIPTWRITER = "scriptwriter"
VISUAL_DESIGNER = "visual_designer"
DISTRIBUTOR = "distributor"
REPORT_GENERATOR = "report_generator"


def _route_after_node(state: QingheState) -> str:
    """错误路由：若上游节点写入 error，则直接跳转到报告生成节点。

    Returns:
        str: 下一节点名称。
    """
    if state.get("error"):
        logger.warning("检测到错误，跳过后续节点直接生成报告: %s", state["error"])
        return REPORT_GENERATOR
    return "continue"


def build_graph():
    """构建并编译青禾映画流水线图。

    Returns:
        CompiledGraph: 可直接 `.invoke(state)` 调用的编译图。
    """
    graph = StateGraph(QingheState)

    # 添加节点
    graph.add_node(PLANNER, planner_node)
    graph.add_node(COPYWRITER, copywriter_node)
    graph.add_node(SCRIPTWRITER, scriptwriter_node)
    graph.add_node(VISUAL_DESIGNER, visual_designer_node)
    graph.add_node(DISTRIBUTOR, distributor_node)
    graph.add_node(REPORT_GENERATOR, report_generator_node)

    # 入口
    graph.add_edge(START, PLANNER)

    # 各节点出错时跳过后续，直接生成报告
    graph.add_conditional_edges(
        PLANNER,
        _route_after_node,
        {"continue": COPYWRITER, REPORT_GENERATOR: REPORT_GENERATOR},
    )
    graph.add_conditional_edges(
        COPYWRITER,
        _route_after_node,
        {"continue": SCRIPTWRITER, REPORT_GENERATOR: REPORT_GENERATOR},
    )
    graph.add_conditional_edges(
        SCRIPTWRITER,
        _route_after_node,
        {"continue": VISUAL_DESIGNER, REPORT_GENERATOR: REPORT_GENERATOR},
    )
    graph.add_conditional_edges(
        VISUAL_DESIGNER,
        _route_after_node,
        {"continue": DISTRIBUTOR, REPORT_GENERATOR: REPORT_GENERATOR},
    )
    graph.add_conditional_edges(
        DISTRIBUTOR,
        _route_after_node,
        {"continue": REPORT_GENERATOR, REPORT_GENERATOR: REPORT_GENERATOR},
    )

    # 报告生成后结束
    graph.add_edge(REPORT_GENERATOR, END)

    compiled = graph.compile()
    logger.info("青禾映画 LangGraph 流水线编译完成")
    return compiled


# 模块级单例，避免每次请求重新编译
app_graph = build_graph()
