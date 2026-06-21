"""FastAPI 后端入口。

提供青禾映画 MVP 的 HTTP 接口：
- POST /api/generate：运行完整多 Agent 流水线（同步返回）
- POST /api/generate/stream：SSE 流式返回每个 Agent 执行进度
- GET  /api/health：健康检查
- GET  /api/docs：Swagger UI（FastAPI 自带）
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from src.config import settings
from src.graph import app_graph
from src.models import UserInput

# ---------- 日志配置 ----------
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------- FastAPI 应用 ----------
app = FastAPI(
    title="青禾映画 API",
    description="LangGraph 多 Agent 协同农业短视频创作平台 MVP",
    version="0.1.0",
)

# 允许 Streamlit 前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", summary="健康检查")
def health() -> dict[str, str]:
    """健康检查接口。"""
    return {"status": "ok", "service": "qinghe-video", "version": "0.1.0"}


@app.post("/api/generate", summary="生成短视频创作方案")
def generate(payload: UserInput) -> dict[str, Any]:
    """运行完整多 Agent 流水线，返回创作方案。

    Args:
        payload: 用户输入的农产品信息。

    Returns:
        dict: 包含 task_id、status 与最终报告及各 Agent 输出。
    """
    task_id = uuid.uuid4().hex[:12]
    logger.info("[API] 收到生成请求 task_id=%s, 产品=%s", task_id, payload.product_name)

    initial_state: dict[str, Any] = {
        "product_name": payload.product_name,
        "origin": payload.origin,
        "category": payload.category,
        "selling_points": payload.selling_points,
        "target_platform": payload.target_platform,
        "target_duration": payload.target_duration,
        "additional_info": payload.additional_info or "",
    }

    try:
        final_state = app_graph.invoke(initial_state)
    except Exception as e:
        logger.exception("[API] 流水线执行失败 task_id=%s", task_id)
        raise HTTPException(status_code=500, detail=f"流水线执行失败: {e}") from e

    if final_state.get("error"):
        logger.warning("[API] 流水线返回错误 task_id=%s: %s", task_id, final_state["error"])

    return {
        "task_id": task_id,
        "status": "error" if final_state.get("error") else "success",
        "result": {
            "planner_output": final_state.get("planner_output"),
            "copywriter_output": final_state.get("copywriter_output"),
            "scriptwriter_output": final_state.get("scriptwriter_output"),
            "visual_output": final_state.get("visual_output"),
            "distributor_output": final_state.get("distributor_output"),
            "final_report": final_state.get("final_report", ""),
            "error": final_state.get("error"),
        },
    }


@app.post("/api/generate/stream", summary="流式生成短视频创作方案")
async def generate_stream(payload: UserInput):
    """以 SSE 方式流式返回每个 Agent 的执行进度与最终结果。

    Args:
        payload: 用户输入的农产品信息。

    Returns:
        StreamingResponse: text/event-stream 格式的事件流。

    事件类型说明：
    - ``node_start``: 某个 Agent 节点开始执行
    - ``node_update``: 某个 Agent 节点完成，携带该节点输出
    - ``error``: 执行过程中出现错误
    - ``complete``: 整个流水线执行完成，携带最终完整状态
    """
    task_id = uuid.uuid4().hex[:12]
    logger.info("[API] 收到流式生成请求 task_id=%s, 产品=%s", task_id, payload.product_name)

    initial_state: dict[str, Any] = {
        "product_name": payload.product_name,
        "origin": payload.origin,
        "category": payload.category,
        "selling_points": payload.selling_points,
        "target_platform": payload.target_platform,
        "target_duration": payload.target_duration,
        "additional_info": payload.additional_info or "",
    }

    # 节点顺序，用于前端展示进度
    NODE_ORDER = ["planner", "copywriter", "scriptwriter", "visual_designer", "distributor", "report_generator"]

    def _build_state():
        """构造包含 task_id 的初始状态。"""
        state = dict(initial_state)
        state["task_id"] = task_id
        return state

    def _serialize(data: Any) -> Any:
        """将状态对象序列化为 JSON 安全格式。"""
        return json.loads(json.dumps(data, ensure_ascii=False, default=str))

    def _format_sse(event: str, data: Any) -> str:
        """格式化 SSE 事件。"""
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"

    async def event_generator():
        """异步生成 SSE 事件流。"""
        state = _build_state()

        # 发送任务开始事件
        yield _format_sse("start", {"task_id": task_id, "nodes": NODE_ORDER})

        try:
            # LangGraph 同步图在异步生成器中使用；单用户场景下可接受
            # stream_mode="updates" 每次 yield 一个 dict：{node_name: state_update}
            for update in app_graph.stream(state, stream_mode="updates"):
                if not update:
                    continue

                for node_name, node_update in update.items():
                    if not node_update:
                        continue

                    # 发送节点开始事件
                    yield _format_sse("node_start", {"node": node_name, "task_id": task_id})

                    # 如果节点返回错误，发送错误事件
                    if "error" in node_update and node_update["error"]:
                        yield _format_sse(
                            "error",
                            {"node": node_name, "error": node_update["error"], "task_id": task_id},
                        )

                    # 发送节点完成事件，附带该节点输出（精简后）
                    node_output = {k: v for k, v in node_update.items() if k != "error"}
                    if node_output:
                        yield _format_sse(
                            "node_update",
                            {
                                "node": node_name,
                                "output": _serialize(node_output),
                                "task_id": task_id,
                            },
                        )

                    # 合并状态，供后续节点使用
                    state.update(node_update)

            # 发送完成事件
            final_result = {
                "planner_output": state.get("planner_output"),
                "copywriter_output": state.get("copywriter_output"),
                "scriptwriter_output": state.get("scriptwriter_output"),
                "visual_output": state.get("visual_output"),
                "distributor_output": state.get("distributor_output"),
                "final_report": state.get("final_report", ""),
                "error": state.get("error"),
            }
            yield _format_sse(
                "complete",
                {
                    "task_id": task_id,
                    "status": "error" if state.get("error") else "success",
                    "result": _serialize(final_result),
                },
            )
        except Exception as e:
            logger.exception("[API] 流式流水线执行失败 task_id=%s", task_id)
            yield _format_sse("error", {"task_id": task_id, "error": f"流水线执行失败: {e}"})
            yield _format_sse("complete", {"task_id": task_id, "status": "error", "result": {}})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def main() -> None:
    """以 uvicorn 方式启动后端服务。"""
    import uvicorn

    logger.info("启动青禾映画后端: %s:%s", settings.APP_HOST, settings.APP_PORT)
    uvicorn.run(
        "src.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=False,
    )


if __name__ == "__main__":
    main()
