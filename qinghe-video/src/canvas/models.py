"""无限画布 Pydantic 模型。

节点与连线沿用 React Flow 的序列化结构（list[dict]），后端不感知具体字段，
仅在 generate 编排时按 type 收集参考图与提示词。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# 参考图类型：内容 / 风格 / 结构 / 姿态（对标即梦四维参考图）
RefType = Literal["content", "style", "structure", "pose"]

# 生成节点状态
GenerateStatus = Literal["idle", "running", "done", "error"]

# 生成模式
GenerateMode = Literal["image", "video"]


class CanvasProjectCreate(BaseModel):
    """创建画布项目请求。"""
    name: str = Field(..., min_length=1, max_length=128, description="项目名称")
    nodes: list[dict[str, Any]] = Field(default_factory=list, description="React Flow nodes")
    edges: list[dict[str, Any]] = Field(default_factory=list, description="React Flow edges")
    viewport: dict[str, Any] = Field(default_factory=dict, description="画布视口 {x,y,zoom}")


class CanvasProjectUpdate(BaseModel):
    """更新画布项目请求（自动保存）。全部字段可选。"""
    name: str | None = Field(None, min_length=1, max_length=128)
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    viewport: dict[str, Any] | None = None


class CanvasProject(BaseModel):
    """画布项目完整响应。"""
    id: str
    name: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    viewport: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    class ConfigDict:
        from_attributes = True


class CanvasProjectSummary(BaseModel):
    """画布项目列表项（不含 nodes/edges，节省带宽）。"""
    id: str
    name: str
    thumbnail_url: str | None = None
    node_count: int = 0
    updated_at: datetime

    class ConfigDict:
        from_attributes = True


class ReferenceInput(BaseModel):
    """单张参考图输入（来自 referenceImage 节点）。"""
    image_url: str = Field(..., description="参考图 URL，如 /outputs/upload/xxx.jpg")
    ref_type: RefType = Field("content", description="参考图类型")


class GenerateRequest(BaseModel):
    """触发生成节点请求。

    前端收集生成节点的所有入边源节点数据后组装此请求。
    """
    node_id: str = Field(..., description="要触发的生成节点 id")
    mode: GenerateMode = Field(default="image", description="生成模式：image / video")
    references: list[ReferenceInput] = Field(default_factory=list, description="参考图列表")
    prompt: str = Field(..., min_length=1, description="正向提示词")
    negative_prompt: str | None = Field(None, description="负向提示词")
    params: dict[str, Any] = Field(
        default_factory=dict,
        description="生成参数：size / model / duration / ratio / resolution / generate_audio / watermark 等",
    )


class GenerateResult(BaseModel):
    """生成结果响应。"""
    node_id: str
    status: GenerateStatus
    result_image_url: str | None = None
    result_video_url: str | None = None
    error: str | None = None


class UploadResponse(BaseModel):
    """参考图上传响应。"""
    url: str = Field(..., description="可访问的相对 URL，如 /outputs/upload/xxx.jpg")
    upload_id: str = Field(..., description="上传标识（文件名）")
    filename: str
    file_size: int


# ============================================================
# 故事板（Storyboard）模型
# ============================================================

# 分镜参考图类型（与工坊一致性图对齐）
ShotRefType = Literal["character", "object", "scene"]


class ShotInput(BaseModel):
    """单个分镜输入（来自工坊 scriptwriter + visual_designer 输出）。"""

    shot_id: str = Field(..., description="分镜 id（来自 scriptwriter_output.shots）")
    title: str = Field("", description="镜号标题，如「分镜 1」")
    visual_prompt: str = Field(..., min_length=1, description="画面描述 / 图片提示词")
    narration: str = Field("", description="本镜旁白文本")
    duration: float = Field(3.5, ge=0.1, description="本镜时长（秒）")
    reference_image_url: str | None = Field(
        None, description="本镜绑定的参考图 URL（优先于 character/object/scene_ref）"
    )
    reference_type: ShotRefType | None = Field(
        None, description="参考图类型，决定回退到哪类一致性图"
    )
    node_id: str | None = Field(
        None, description="前端 ShotNode 节点 id，用于回写状态与结果图"
    )


class StoryboardGenerateRequest(BaseModel):
    """故事板批量生成请求。"""

    shots: list[ShotInput] = Field(..., min_length=1, description="分镜列表")
    character_ref: str | None = Field(None, description="人物一致性参考图 URL")
    object_ref: str | None = Field(None, description="物品一致性参考图 URL")
    scene_ref: str | None = Field(None, description="场景一致性参考图 URL")
    size: str | None = Field(None, description="图片尺寸，如 1920x1920")
    model: str | None = Field(None, description="图片模型 id")
    concurrency: int = Field(3, ge=1, le=8, description="并发数上限")


class StoryboardGenerateResult(BaseModel):
    """故事板批量生成结果。"""

    results: list[GenerateResult] = Field(
        default_factory=list, description="每个分镜的生成结果（顺序与请求一致）"
    )


class ShotResultInput(BaseModel):
    """单个分镜的合成输入。"""

    shot_id: str
    image_url: str = Field(..., description="本镜结果图 URL")
    narration: str = Field("", description="本镜旁白")
    duration: float = Field(3.5, ge=0.1)


class StoryboardComposeRequest(BaseModel):
    """故事板视频合成请求。"""

    shot_results: list[ShotResultInput] = Field(
        ..., min_length=1, description="各分镜结果图与旁白"
    )
    voiceover_text: str | None = Field(
        None, description="整体旁白（优先于 shot narration 拼接）"
    )


class StoryboardComposeResult(BaseModel):
    """故事板视频合成结果。"""

    status: str
    video_url: str | None = None
    audio_url: str | None = None
    error: str | None = None


# ============================================================
# 段级故事板（Segment-level Director Board）模型
# ============================================================


class SegmentInput(BaseModel):
    """单个故事板片段输入（段级导演板图生成）。

    与 ShotInput（shot 级分镜图）的区别：
    - 产物是一张含 SHOT GRID / CAMERA RHYTHM / SOUND BEAT 等布局的"导演板图"，
      而非单镜分镜图。
    - 提示词由 system_prompt + storyboard_text 拼接，直接喂生图模型（不经 LLM 翻译）。
    - 参考图统一用画布级 character/object/scene_ref，不单独绑定。
    """

    segment_id: str = Field(..., description="片段 id（来自 scriptwriter_output.segments）")
    storyboard_text: str = Field(..., min_length=1, description="04b 故事板文本")
    system_prompt: str | None = Field(
        None,
        description="段级导演板系统提示词；未传则用后端默认 STORYBOARD_BOARD_PROMPT",
    )
    title: str = Field("", description="片段标题，如「片段 1」")
    node_id: str | None = Field(
        None, description="前端 StoryboardSegmentNode 节点 id，用于回写状态与结果图"
    )


class SegmentGenerateRequest(BaseModel):
    """段级故事板批量生成请求。"""

    segments: list[SegmentInput] = Field(..., min_length=1, description="片段列表")
    character_ref: str | None = Field(None, description="人物一致性参考图 URL")
    object_ref: str | None = Field(None, description="物品一致性参考图 URL")
    scene_ref: str | None = Field(None, description="场景一致性参考图 URL")
    size: str | None = Field(None, description="图片尺寸，如 1920x1920")
    model: str | None = Field(None, description="图片模型 id")
    concurrency: int = Field(3, ge=1, le=8, description="并发数上限")


class SegmentGenerateResult(BaseModel):
    """段级生成单条结果。"""

    node_id: str
    status: GenerateStatus
    result_image_url: str | None = None
    error: str | None = None


class SegmentGenerateResponse(BaseModel):
    """段级故事板批量生成结果。"""

    results: list[SegmentGenerateResult] = Field(
        default_factory=list, description="每个片段的生成结果（顺序与请求一致）"
    )
