"""DuckDuckGo 联网搜索工具。

免 API key，使用 duckduckgo-search SDK。
异常不抛出，保证 ReAct 循环不中断。
"""

from __future__ import annotations

import logging
from typing import Any

from src.config import settings

logger = logging.getLogger(__name__)

try:
    from duckduckgo_search import DDGS  # type: ignore

    HAS_DDGS = True
except ImportError:
    DDGS = None  # type: ignore[assignment]
    HAS_DDGS = False
    logger.warning("[conversation_agent.search] 未安装 duckduckgo-search，联网搜索不可用")


def web_search(query: str, max_results: int | None = None) -> list[dict[str, Any]]:
    """调用 DuckDuckGo 搜索，返回结果列表。

    Args:
        query: 搜索关键词。
        max_results: 最大返回数，默认取 settings.WEB_SEARCH_MAX_RESULTS。

    Returns:
        list[dict]: 每项含 title / url / snippet。出错返回空列表。
    """
    if not HAS_DDGS:
        logger.warning("[web_search] duckduckgo-search 未安装，返回空结果")
        return []

    limit = max_results if max_results is not None else settings.WEB_SEARCH_MAX_RESULTS
    try:
        results: list[dict[str, Any]] = []
        with DDGS() as ddgs:
            for item in ddgs.text(query, max_results=limit):
                results.append(
                    {
                        "title": item.get("title", ""),
                        "url": item.get("href") or item.get("url", ""),
                        "snippet": item.get("body") or item.get("snippet", ""),
                    }
                )
        logger.info("[web_search] query=%s, 返回 %d 条结果", query, len(results))
        return results
    except Exception as e:
        logger.warning("[web_search] 搜索失败 query=%s: %s", query, e)
        return []


def web_search_tool_func(query: str) -> str:
    """工具函数：搜索并格式化为字符串供 LLM 阅读。

    Args:
        query: 搜索关键词。

    Returns:
        str: 格式化的搜索结果（标题+摘要+URL），无结果时返回提示。
    """
    results = web_search(query)
    if not results:
        return f"未搜索到关于「{query}」的结果。"

    lines = [f"搜索「{query}」共 {len(results)} 条结果："]
    for i, item in enumerate(results, 1):
        lines.append(f"\n{i}. {item['title']}")
        if item["snippet"]:
            lines.append(f"   摘要：{item['snippet']}")
        if item["url"]:
            lines.append(f"   链接：{item['url']}")
    return "\n".join(lines)
