"""全局状态定义。

使用 TypedDict 定义贯穿所有 Agent 节点的共享状态。
"""

from typing import TypedDict


class QingheState(TypedDict, total=False):
    """青禾映画流水线全局状态。

    所有字段均可选（total=False），便于节点按需写入。
    """

    # ---------- 用户输入 ----------
    product_name: str
    origin: str
    category: str
    selling_points: str
    target_platform: str
    target_duration: str
    additional_info: str

    # ---------- 各 Agent 输出 ----------
    planner_output: dict
    copywriter_output: dict
    scriptwriter_output: dict
    visual_output: dict
    distributor_output: dict

    # ---------- 最终结果 ----------
    final_report: str

    # ---------- 错误处理 ----------
    error: str
