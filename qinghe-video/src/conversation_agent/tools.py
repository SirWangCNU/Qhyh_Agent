"""工具注册表：schema 定义 + 函数映射 + 统一执行入口。

schema 与工具函数参数严格对齐，供 LLM function calling 使用。
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from src.conversation_agent.media_tools import (
    generate_image_tool_func,
    generate_tts_tool_func,
    generate_video_tool_func,
)
from src.conversation_agent.models import ToolResult
from src.conversation_agent.pipeline_tool import run_pipeline_tool_func
from src.conversation_agent.search import web_search_tool_func

logger = logging.getLogger(__name__)


def get_tool_schemas() -> list[dict[str, Any]]:
    """返回 OpenAI function calling 格式的工具 schema 列表。"""
    return [
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "联网搜索外部信息（农产品行情、热门话题、竞品资料、农业知识等）。需要获取最新信息时调用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "搜索关键词"},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "run_pipeline",
                "description": "调用青禾映画主流水线生成完整创作方案（含策划、文案、分镜脚本、视觉方案、投放策略）。用户需求信息充足时调用。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_name": {"type": "string", "description": "产品名称"},
                        "origin": {"type": "string", "description": "产地"},
                        "category": {"type": "string", "description": "品类"},
                        "selling_points": {"type": "string", "description": "卖点"},
                        "target_platform": {
                            "type": "string",
                            "description": "目标平台（抖音/快手/B站/视频号）",
                        },
                        "target_duration": {
                            "type": "string",
                            "description": "目标时长（如 30秒/60秒）",
                        },
                        "additional_info": {"type": "string", "description": "补充信息"},
                    },
                    "required": ["product_name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "generate_image",
                "description": "生成图片素材（当前为 mock 占位）。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "description": "图片提示词"},
                        "size": {"type": "string", "description": "图片尺寸，默认 1920x1920"},
                    },
                    "required": ["prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "generate_video",
                "description": "生成视频素材（当前为 mock 占位）。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "description": "视频提示词"},
                        "duration": {"type": "integer", "description": "视频时长（秒），默认 5"},
                    },
                    "required": ["prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "generate_tts",
                "description": "生成语音配音（当前为 mock 占位）。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "description": "配音文本"},
                        "voice": {
                            "type": "string",
                            "description": "音色，默认 zh-CN-XiaoxiaoNeural",
                        },
                    },
                    "required": ["text"],
                },
            },
        },
    ]


def get_tool_functions() -> dict[str, Callable[..., str]]:
    """返回工具名 → 工具函数的映射。"""
    return {
        "web_search": web_search_tool_func,
        "run_pipeline": run_pipeline_tool_func,
        "generate_image": generate_image_tool_func,
        "generate_video": generate_video_tool_func,
        "generate_tts": generate_tts_tool_func,
    }


def execute_tool(name: str, args: dict[str, Any]) -> ToolResult:
    """统一工具执行入口，查表调用 + 异常捕获。

    Args:
        name: 工具名。
        args: 工具参数字典。

    Returns:
        ToolResult: 执行结果（含 success 标志）。
    """
    functions = get_tool_functions()
    func = functions.get(name)
    if func is None:
        logger.warning("[execute_tool] 未知工具: %s", name)
        return ToolResult(name=name, output=f"未知工具：{name}", success=False)
    try:
        output = func(**args)
        logger.info("[execute_tool] 工具 %s 执行成功", name)
        return ToolResult(name=name, output=str(output), success=True)
    except Exception as e:
        logger.exception("[execute_tool] 工具 %s 执行失败", name)
        return ToolResult(name=name, output=f"工具 {name} 执行失败：{e}", success=False)
