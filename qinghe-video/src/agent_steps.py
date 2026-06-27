"""单步 Agent 执行服务。

把原本串行的 LangGraph 节点拆成可独立调用的步骤，供前端工作台逐步执行。
"""

from __future__ import annotations

from typing import Any, Callable, Literal

from pydantic import BaseModel, Field

from src.models import UserInput
from src.nodes.copywriter import copywriter_node
from src.nodes.distributor import distributor_node
from src.nodes.planner import planner_node
from src.nodes.report_generator import report_generator_node
from src.nodes.scriptwriter import scriptwriter_node
from src.nodes.visual_designer import visual_designer_node

AgentStep = Literal[
    "planner",
    "copywriter",
    "scriptwriter",
    "visual_designer",
    "distributor",
    "report_generator",
]


class AgentStepRequest(BaseModel):
    """单步 Agent 执行请求。"""

    input: UserInput
    state: dict[str, Any] = Field(default_factory=dict)


STEP_OUTPUT_KEY: dict[str, str] = {
    "planner": "planner_output",
    "copywriter": "copywriter_output",
    "scriptwriter": "scriptwriter_output",
    "visual_designer": "visual_output",
    "distributor": "distributor_output",
    "report_generator": "final_report",
}

STEP_LABEL: dict[str, str] = {
    "planner": "策划 Agent",
    "copywriter": "文案 Agent",
    "scriptwriter": "脚本 Agent",
    "visual_designer": "视觉 Agent",
    "distributor": "投放 Agent",
    "report_generator": "报告生成",
}

STEP_NODE: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "planner": planner_node,
    "copywriter": copywriter_node,
    "scriptwriter": scriptwriter_node,
    "visual_designer": visual_designer_node,
    "distributor": distributor_node,
    "report_generator": report_generator_node,
}


def build_step_state(request: AgentStepRequest) -> dict[str, Any]:
    """合并用户输入与上游状态。"""
    state = dict(request.state or {})
    payload = request.input
    state.update(
        {
            "product_name": payload.product_name,
            "origin": payload.origin,
            "category": payload.category,
            "selling_points": payload.selling_points,
            "target_platform": payload.target_platform,
            "target_duration": payload.target_duration,
            "additional_info": payload.additional_info or "",
        }
    )
    state.pop("error", None)
    return state


def run_agent_step(step: AgentStep, request: AgentStepRequest) -> dict[str, Any]:
    """执行指定 Agent 步骤，并返回更新后的全局状态。"""
    state = build_step_state(request)
    update = STEP_NODE[step](state)
    state.update(update)

    status = "error" if state.get("error") else "success"
    return {
        "status": status,
        "step": step,
        "label": STEP_LABEL[step],
        "output_key": STEP_OUTPUT_KEY[step],
        "output": state.get(STEP_OUTPUT_KEY[step]),
        "state": state,
        "error": state.get("error"),
    }
