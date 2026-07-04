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
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.agent_steps import AgentStep, AgentStepRequest, run_agent_step
from src.assets import assets_router, record_asset, url_to_local_path
from src.auth.dependencies import get_current_user
from src.canvas.router import router as canvas_router
from src.conversation_agent.router import router as conversation_router
from src.conversation_sessions.router import router as conversation_sessions_router
from src.auth.router import router as auth_router
from src.config import get_video_model_options, settings
from src.consistency_images import consistency_images_router
from src.db.database import get_db
from src.db.models import User
from src.graph import app_graph
from src.image_generation import (
    EditImageGenerationRequest,
    ImageGenerationRequest,
    generate_edit_image,
    generate_image,
)
from src.models import UserInput
from src.text_polish import PolishRequest, polish_user_input
from src.topic_generation import TopicRequest, generate_topics
from src.tts_service import synthesize as tts_synthesize, _synthesize_async
from src.video_compose import compose as compose_video
from src.video_generation import VideoGenerationRequest, VideoGenerationResponse, generate_video
from src.video_mvp import VideoMvpRequest, video_mvp as run_video_mvp
from src.workshop_sessions.router import router as workshop_sessions_router

# ---------- 日志配置 ----------
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------- FastAPI 应用 ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理。"""
    yield

app = FastAPI(
    title="青禾映画 API",
    description="青禾映画农业短视频创作平台 MVP",
    version="0.1.0",
    lifespan=lifespan,
)

# 注册鉴权路由
app.include_router(auth_router)
# 注册一致性生图路由（人物/物品/场景参考图）
app.include_router(consistency_images_router)
# 注册「我的资产」路由（用户生成媒体资产持久化）
app.include_router(assets_router)
# 注册无限画布路由（自由画布 + 多参考图生成）
app.include_router(canvas_router)
# 注册工坊会话路由（分步工坊历史记录持久化）
app.include_router(workshop_sessions_router)
# 注册对话创作 Agent 路由（ReAct 自主决策 + 联网搜索）
app.include_router(conversation_router)
# 注册对话会话路由（对话历史持久化 + 侧边栏列表）
app.include_router(conversation_sessions_router)

# 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- 静态文件服务 ----------
# 开发模式：Vite dev server (:5173) 通过 vite.config.ts 的 proxy 转发 /api /outputs 到本服务，
#           前端不依赖 FastAPI serve。
# 生产模式：执行 `npm run build` 后产物在 frontend/dist/，FastAPI 直接 serve 该目录。
_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
_FRONTEND_DIST = _FRONTEND_DIR / "dist"
_FRONTEND_ASSETS = _FRONTEND_DIST / "assets"

if _FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_ASSETS)), name="assets")

# ---------- 产物目录（音频 / 视频） ----------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_OUTPUTS_DIR = _PROJECT_ROOT / "outputs"
_AUDIO_DIR = _OUTPUTS_DIR / "audio"
_VIDEO_DIR = _OUTPUTS_DIR / "video"
_UPLOAD_DIR = _OUTPUTS_DIR / "upload"
_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=str(_OUTPUTS_DIR)), name="outputs")


def _serve_spa() -> HTMLResponse:
    """返回 React SPA 入口 index.html（来自 frontend/dist/）。

    开发模式下若未构建，提示用户运行 npm run dev 或 npm run build。
    """
    index_file = _FRONTEND_DIST / "index.html"
    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "前端未构建。请在 qinghe-video/frontend/ 下执行 `npm run build`，"
                "或使用 `npm run dev` 启动 Vite 开发服务器（端口 5173）。"
            ),
        )
    return HTMLResponse(content=index_file.read_text(encoding="utf-8"))


@app.get("/", summary="前端页面")
def index():
    """返回前端 index.html。"""
    return _serve_spa()


# SPA 路由兼容：所有前端路径返回同一 index.html，由 React Router 接管
@app.get("/chat", summary="对话创作页面")
@app.get("/plan", summary="规划设计页面")
@app.get("/create", summary="开始创作页面")
@app.get("/workshop", summary="分步工坊页面")
@app.get("/canvas", summary="无限画布页面")
def spa_routes():
    """SPA 路由兼容：所有前端路径返回同一 index.html。"""
    return _serve_spa()


@app.get("/api/health", summary="健康检查")
def health() -> dict[str, str]:
    """健康检查接口。"""
    return {"status": "ok", "service": "qinghe-video", "version": "0.1.0"}


@app.post("/api/agents/{step}", summary="单步执行 Agent")
def run_agent_step_api(step: AgentStep, payload: AgentStepRequest, _current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """按步骤单独执行指定 Agent，并返回累计状态。"""
    try:
        result = run_agent_step(step, payload)
    except Exception as e:
        logger.exception("[API] 单步 Agent 执行失败 step=%s", step)
        raise HTTPException(status_code=500, detail=f"{step} 执行失败: {e}") from e

    if result.get("error"):
        logger.warning("[API] 单步 Agent 返回错误 step=%s: %s", step, result["error"])
    return result


@app.post("/api/text/polish", summary="AI 一句话润写为完整输入")
def polish_text_api(req: PolishRequest, _current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """把用户的一句话创意扩写为完整 UserInput 字段（产地/品类/卖点等）。

    返回字段：
    - ``status``: 固定 "success"
    - ``input``: 补全后的完整 UserInput 字段，可直接用于 /api/agents/{step}
    """
    try:
        result = polish_user_input(req)
    except Exception as e:
        logger.exception("[API] 文本润写失败")
        raise HTTPException(status_code=500, detail=f"润写失败: {e}") from e
    return {"status": "success", "input": result.model_dump()}


@app.post("/api/topics/generate", summary="AI 生成爆款候选主题")
def generate_topics_api(req: TopicRequest, _current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """基于「产品名 + 一句话创意」生成多个差异化的爆款主题候选，供用户选择。

    返回字段：
    - ``status``: 固定 "success"
    - ``topics``: 候选主题列表，每个含 theme/creative_angle/pain_point/target_audience/traffic_hook/appeal_reason
    """
    try:
        result = generate_topics(req)
    except Exception as e:
        logger.exception("[API] 选题生成失败")
        raise HTTPException(status_code=500, detail=f"选题失败: {e}") from e
    return {"status": "success", "topics": [t.model_dump() for t in result.topics]}


@app.post("/api/images/generate", summary="生成图片素材")
async def generate_image_asset(payload: ImageGenerationRequest, _current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """使用配置的图片模型生成视觉素材。"""
    try:
        images = await generate_image(payload)
    except Exception as e:
        logger.exception("[API] 图片生成失败")
        raise HTTPException(status_code=500, detail=f"图片生成失败: {e}") from e

    # 自动收集：每张图落库到资产表（失败仅记日志，不阻断主流程）
    for item in images:
        if not item.url:
            continue
        try:
            record_asset(
                db,
                _current_user.id,
                source="image_gen",
                media_type="image",
                url=item.url,
                file_path=url_to_local_path(item.url),
                title=(payload.title or payload.prompt[:80] if payload.prompt else None),
            )
        except Exception:
            logger.warning("[assets] 图片生成资产落库失败 url=%s", item.url, exc_info=True)

    return {
        "status": "success",
        "model": settings.IMAGE_MODEL,
        "size": payload.size or settings.IMAGE_SIZE,
        "images": [item.model_dump() for item in images],
    }


@app.post("/api/images/edit-generate", summary="使用 gpt-image-2 生成/编辑图片")
async def generate_edit_image_asset(payload: EditImageGenerationRequest, _current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """使用 gpt-image-2 模型生成或编辑图片素材。"""
    try:
        images = await generate_edit_image(payload)
    except Exception as e:
        logger.exception("[API] gpt-image-2 图片生成失败")
        raise HTTPException(status_code=500, detail=f"图片生成失败: {e}") from e

    # 自动收集：每张图落库到资产表（失败仅记日志，不阻断主流程）
    for item in images:
        if not item.url:
            continue
        try:
            record_asset(
                db,
                _current_user.id,
                source="image_edit",
                media_type="image",
                url=item.url,
                file_path=url_to_local_path(item.url),
                title=(payload.title or payload.prompt[:80] if payload.prompt else None),
            )
        except Exception:
            logger.warning("[assets] gpt-image-2 资产落库失败 url=%s", item.url, exc_info=True)

    return {
        "status": "success",
        "model": payload.model,
        "size": payload.size,
        "images": [item.model_dump() for item in images],
    }


@app.post("/api/videos/generate", summary="生成视频素材")
async def generate_video_asset(
    payload: VideoGenerationRequest,
    _current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """提交视频生成任务并轮询直到完成，返回本地 video_url。"""
    try:
        result = await generate_video(payload)
    except Exception as e:
        logger.exception("[video] 视频生成失败")
        return VideoGenerationResponse(status="error", error=str(e)).model_dump()
    return result.model_dump()


@app.get("/api/videos/models", summary="列出可选视频模型")
def list_video_models(_current_user: User = Depends(get_current_user)) -> list[str]:
    """返回前端生成节点可选的视频模型列表。"""
    return get_video_model_options()


# ---------- TTS 配音 ----------
class TTSRequest(BaseModel):
    """TTS 旁白合成请求。"""

    text: str
    filename: str | None = None


@app.post("/api/tts/generate", summary="合成旁白配音")
async def generate_tts(req: TTSRequest, _current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """使用 edge-tts 将文本合成为 mp3 音频，写入 outputs/audio/ 目录。

    返回字段：
    - ``audio_path``: 服务端绝对路径
    - ``audio_url``: 可通过浏览器访问的相对 URL（/outputs/audio/xxx.mp3）
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")

    filename = (req.filename or f"tts_{uuid.uuid4().hex[:12]}.mp3").strip()
    if not filename.lower().endswith(".mp3"):
        filename = f"{filename}.mp3"
    # 防止路径穿越：仅保留文件名部分
    filename = Path(filename).name

    audio_path = _AUDIO_DIR / filename
    try:
        await _synthesize_async(req.text, str(audio_path))
    except Exception as e:
        logger.exception("[API] TTS 合成失败 filename=%s", filename)
        raise HTTPException(status_code=500, detail=f"TTS 合成失败: {e}") from e

    audio_url = f"/outputs/audio/{filename}"
    # 自动收集：落库到资产表（失败仅记日志，不阻断主流程）
    try:
        record_asset(
            db,
            _current_user.id,
            source="tts",
            media_type="audio",
            url=audio_url,
            file_path=str(audio_path),
            filename=filename,
            mime_type="audio/mpeg",
        )
    except Exception:
        logger.warning("[assets] TTS 资产落库失败 url=%s", audio_url, exc_info=True)

    return {
        "status": "success",
        "audio_path": str(audio_path),
        "audio_url": audio_url,
    }


# ---------- 视频合成 ----------
class VideoComposeRequest(BaseModel):
    """视频合成请求。"""

    image_urls: list[str]
    audio_path: str
    filename: str | None = None


@app.post("/api/video/compose", summary="合成竖屏 mp4 视频")
async def compose_video_endpoint(req: VideoComposeRequest, _current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """把分镜图片轮播 + TTS 旁白拼接为 9:16 竖屏 mp4。

    返回字段：
    - ``video_path``: 服务端绝对路径
    - ``video_url``: 可通过浏览器访问的相对 URL（/outputs/video/xxx.mp4）
    """
    if not req.image_urls:
        raise HTTPException(status_code=400, detail="至少需要 1 张图片")
    if not req.audio_path.strip():
        raise HTTPException(status_code=400, detail="音频路径不能为空")

    filename = (req.filename or f"video_{uuid.uuid4().hex[:12]}.mp4").strip()
    if not filename.lower().endswith(".mp4"):
        filename = f"{filename}.mp4"
    # 防止路径穿越：仅保留文件名部分
    filename = Path(filename).name

    video_path = _VIDEO_DIR / filename
    try:
        compose_video(req.image_urls, req.audio_path, str(video_path))
    except Exception as e:
        logger.exception("[API] 视频合成失败 filename=%s", filename)
        raise HTTPException(status_code=500, detail=f"视频合成失败: {e}") from e

    video_url = f"/outputs/video/{filename}"
    # 自动收集：落库到资产表（失败仅记日志，不阻断主流程）
    try:
        record_asset(
            db,
            _current_user.id,
            source="video_compose",
            media_type="video",
            url=video_url,
            file_path=str(video_path),
            filename=filename,
            mime_type="video/mp4",
        )
    except Exception:
        logger.warning("[assets] 视频合成资产落库失败 url=%s", video_url, exc_info=True)

    return {
        "status": "success",
        "video_path": str(video_path),
        "video_url": video_url,
    }


# ---------- 一键成片 ----------
@app.post("/api/video/mvp", summary="一键成片（分镜取图 → TTS → 视频合成）")
async def video_mvp_endpoint(req: VideoMvpRequest, _current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """一键成片：从 workshop state 取分镜 prompt → 逐镜生图 → TTS 合成 → 视频合成。

    请求体传入完整流水线 state（至少含 ``visual_output.shot_prompts``，
    推荐含 ``copywriter_output``），可选 ``text`` 覆盖旁白。

    返回字段：
    - ``video_url``: 合成 mp4 的可访问 URL（/outputs/video/mvp_xxx.mp4）
    - ``audio_url``: TTS 音频 URL（/outputs/audio/mvp_xxx.mp3）
    - ``image_count``: 实际生成的分镜图片数
    - ``duration_estimate``: 预估视频时长（秒）
    """
    try:
        result = await run_video_mvp(req, _AUDIO_DIR, _VIDEO_DIR)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        logger.exception("[API] 一键成片失败")
        raise HTTPException(status_code=500, detail=f"一键成片失败: {e}") from e

    # 自动收集：视频（主）+ 旁白音频 各落库一条（失败仅记日志，不阻断主流程）
    video_url = result.get("video_url") or ""
    audio_url = result.get("audio_url") or ""
    image_count = result.get("image_count")
    meta = {"image_count": image_count, "task_id": result.get("task_id")} if image_count is not None else None
    try:
        if video_url:
            record_asset(
                db,
                _current_user.id,
                source="video_mvp",
                media_type="video",
                url=video_url,
                file_path=url_to_local_path(video_url),
                filename=Path(video_url).name,
                mime_type="video/mp4",
                meta=meta,
            )
        if audio_url:
            record_asset(
                db,
                _current_user.id,
                source="video_mvp",
                media_type="audio",
                url=audio_url,
                file_path=url_to_local_path(audio_url),
                filename=Path(audio_url).name,
                mime_type="audio/mpeg",
                meta=meta,
            )
    except Exception:
        logger.warning("[assets] 一键成片资产落库失败 video=%s", video_url, exc_info=True)

    return result


@app.post("/api/generate", summary="生成短视频创作方案")
def generate(payload: UserInput, _current_user: User = Depends(get_current_user)) -> dict[str, Any]:
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
async def generate_stream(payload: UserInput, _current_user: User = Depends(get_current_user)):
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
