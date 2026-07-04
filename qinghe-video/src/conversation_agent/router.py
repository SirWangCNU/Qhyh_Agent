"""对话创作 Agent 的 FastAPI 路由。

POST /api/conversation/chat        SSE 流式对话（需登录）
POST /api/conversation/chat/sync   同步对话（需登录）
GET  /api/conversation/health      健康检查（需登录）

自动创建会话（conversation_id 为空时），流结束后把本轮 user 消息与 assistant
最终答案（含 ReAct 事件 meta）落库到 conversation_messages 表，并返回 conversation_id。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.auth.dependencies import get_current_user
from src.conversation_agent.models import ConversationRequest, ConversationResponse
from src.conversation_agent.service import run_conversation, run_conversation_stream
from src.conversation_sessions.persistence import append_message, create_conversation, update_iterations
from src.db.database import get_db
from src.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


def _persist_round(
    db: Session,
    user_id: int,
    conversation_id: str,
    *,
    user_text: str,
    assistant_answer: str,
    events: list[dict[str, Any]],
    iterations: int,
    error_message: str | None = None,
) -> None:
    """把本轮对话（user + assistant）落库。失败仅记日志，不阻断流。"""
    try:
        append_message(
            db, conversation_id, user_id,
            role="user", msg_type="text", content=user_text,
        )
        assistant_content = assistant_answer
        assistant_meta: dict[str, Any] = {"events": events, "iterations": iterations}
        if error_message:
            assistant_meta["error"] = error_message
            if not assistant_content:
                assistant_content = f"对话异常中断：{error_message}"
        append_message(
            db, conversation_id, user_id,
            role="assistant", msg_type="react",
            content=assistant_content,
            meta=assistant_meta,
        )
        update_iterations(db, conversation_id, user_id, iterations=iterations)
    except Exception:
        logger.warning(
            "[chat_stream] 落库失败 conversation_id=%s", conversation_id, exc_info=True
        )


def _extract_last_user_text(request: ConversationRequest) -> str:
    """提取请求中最后一条 user 消息的文本。"""
    for msg in reversed(request.messages):
        if msg.role == "user":
            return msg.content
    return ""


@router.post("/chat/sync", summary="同步对话创作（返回完整响应）")
def chat_sync(
    request: ConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationResponse:
    """同步执行对话创作 agent，等待全部完成后返回。会自动创建会话并落库。"""
    user_text = _extract_last_user_text(request)
    conversation_id = request.conversation_id

    if not conversation_id:
        conv = create_conversation(db, current_user.id, first_message=user_text)
        conversation_id = conv.id

    try:
        resp = run_conversation(request)
    except Exception as e:
        logger.exception("[chat_sync] 对话执行失败")
        raise HTTPException(status_code=500, detail=f"对话执行失败: {e}") from e

    _persist_round(
        db, current_user.id, conversation_id,
        user_text=user_text,
        assistant_answer=resp.answer,
        events=[e.model_dump() for e in resp.events],
        iterations=resp.iterations,
    )
    resp.conversation_id = conversation_id
    return resp


@router.post("/chat", summary="流式对话创作（SSE）")
def chat_stream(
    request: ConversationRequest,
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """SSE 流式返回对话事件（think/tool_call/tool_result/answer/done/error）。

    自动创建会话，在 done/error 事件后把本轮对话落库，
    并在 done 事件 data 中携带 conversation_id 供前端回写。

    注意：db session 必须在 event_generator 内部创建，因为 StreamingResponse
    的生成器在路由函数返回后才执行，此时 Depends(get_db) 的 session 已被关闭。
    """
    from src.db.database import SessionLocal

    media_type = "text/event-stream"
    conversation_id = request.conversation_id
    user_text = _extract_last_user_text(request)
    user_id = current_user.id

    def event_generator():
        nonlocal conversation_id
        collected_events: list[dict[str, Any]] = []
        answer_text = ""
        iterations = 0
        had_error = False
        error_message = ""
        db = SessionLocal()
        try:
            if not conversation_id:
                conv = create_conversation(db, user_id, first_message=user_text)
                conversation_id = conv.id
                created_ev = json.dumps(
                    {"event": "conversation_created", "data": {"conversation_id": conv.id}},
                    ensure_ascii=False,
                )
                yield f"data: {created_ev}\n\n"

            for ev in run_conversation_stream(request):
                ev_dict = {"event": ev.event, "data": ev.data}
                if ev.event in ("think", "tool_call", "tool_result"):
                    collected_events.append(ev_dict)
                elif ev.event == "answer":
                    answer_text = ev.data.get("answer", "")
                elif ev.event == "done":
                    iterations = ev.data.get("iterations", 0)
                    ev_dict = {
                        "event": ev.event,
                        "data": {**ev.data, "conversation_id": conversation_id},
                    }

                yield f"data: {json.dumps(ev_dict, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("[chat_stream] 流式对话失败")
            had_error = True
            error_message = str(e)
            err = json.dumps(
                {"event": "error", "data": {"message": str(e)}}, ensure_ascii=False
            )
            yield f"data: {err}\n\n"
        finally:
            try:
                if conversation_id and user_text:
                    _persist_round(
                        db, user_id, conversation_id,
                        user_text=user_text,
                        assistant_answer=answer_text,
                        events=collected_events,
                        iterations=iterations,
                        error_message=error_message if had_error else None,
                    )
            except Exception:
                logger.warning("[chat_stream] finally 落库异常", exc_info=True)
            finally:
                db.close()

    return StreamingResponse(event_generator(), media_type=media_type)


@router.get("/health", summary="对话创作 Agent 健康检查")
def health(_current_user: User = Depends(get_current_user)) -> dict[str, str]:
    """对话创作 Agent 模块健康检查（需登录）。"""
    return {"status": "ok", "module": "conversation_agent"}
