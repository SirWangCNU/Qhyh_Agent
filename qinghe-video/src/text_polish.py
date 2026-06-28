"""AI 一句话润写服务。

把用户提供的「产品名 + 一句话创意」扩写为完整的 UserInput 字段，
供后续 planner 等 Agent 节点直接消费。

用法示例::

    from src.text_polish import PolishRequest, polish_user_input

    req = PolishRequest(product_name="阳山水蜜桃", one_liner="想拍产地溯源短视频")
    result = polish_user_input(req)
    print(result.origin)       # 江苏无锡
    print(result.category)     # 水果
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, ConfigDict, ValidationError

from src.config import get_system_prompt
from src.nodes.llm import get_llm

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = get_system_prompt("polish")


class PolishRequest(BaseModel):
    """润写请求：产品名 + 一句话创意。"""

    model_config = ConfigDict(extra="forbid")

    product_name: str
    one_liner: str


class PolishResult(BaseModel):
    """润写结果：完整 UserInput 字段。

    字段与 ``src.models.UserInput`` 对齐，前端拿到后可直接填入表单。
    """

    model_config = ConfigDict(extra="forbid")

    product_name: str
    origin: str
    category: str
    selling_points: str
    target_platform: str = "抖音"
    target_duration: str = "30-60秒"
    additional_info: str = ""


def polish_user_input(req: PolishRequest) -> PolishResult:
    """调用 LLM 把一句话创意扩写为完整 UserInput 字段。

    Args:
        req: 包含产品名和一句话创意的请求。

    Returns:
        PolishResult: 补全后的完整字段，可直接用于 planner。

    Raises:
        ValidationError: LLM 输出不符合 PolishResult 结构。
        Exception: LLM 调用失败。
    """
    logger.info(
        "[Polish] 开始润写，产品=%s, 创意=%s", req.product_name, req.one_liner
    )
    try:
        llm = get_llm(temperature=0.7)
        structured_llm = llm.with_structured_output(PolishResult)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYSTEM_PROMPT),
                (
                    "human",
                    "请根据以下信息补全完整的农产品创作输入：\n"
                    "产品名称：{product_name}\n"
                    "一句话创意：{one_liner}",
                ),
            ]
        )

        chain = prompt | structured_llm
        result: PolishResult = chain.invoke(
            {
                "product_name": req.product_name,
                "one_liner": req.one_liner,
            }
        )

        logger.info(
            "[Polish] 润写完成，产地=%s, 品类=%s",
            result.origin,
            result.category,
        )
        return result
    except ValidationError as e:
        logger.exception("[Polish] 输出校验失败")
        raise RuntimeError(f"润写输出格式错误: {e}") from e
    except Exception as e:
        logger.exception("[Polish] 润写失败")
        raise RuntimeError(f"润写失败: {e}") from e
