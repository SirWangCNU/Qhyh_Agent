"""Pydantic v2 数据模型定义。

为每个 Agent 定义输出模型，用于 LangChain `with_structured_output` 严格校验。
字段名与各 Agent system prompt 中的 JSON 结构严格对齐。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ============================================================
# 策划 Agent（Planner）
# ============================================================
class TargetAudience(BaseModel):
    """目标受众画像。"""

    model_config = ConfigDict(extra="forbid")

    age_range: str = Field(..., description="年龄区间，如 25-45岁")
    region: str = Field(..., description="地域，如 一二线城市")
    consumer_profile: str = Field(..., description="消费习惯画像")


class PlannerOutput(BaseModel):
    """策划 Agent 输出。"""

    model_config = ConfigDict(extra="forbid")

    theme: str = Field(..., description="视频主题（一句话）")
    core_selling_points: list[str] = Field(
        ..., max_length=3, description="核心卖点（最多 3 个）"
    )
    target_audience: TargetAudience
    emotion_tone: str = Field(..., description="情绪基调")
    creative_angle: str = Field(..., description="创意切入点")
    video_type: Literal[
        "原产地溯源", "种植过程", "美食制作", "对比测评", "生活方式"
    ]
    strategy_notes: str | None = Field(None, description="策略补充说明")


# ============================================================
# 文案 Agent（Copywriter）
# ============================================================
class HookSegment(BaseModel):
    """开头钩子 / CTA 段落。"""

    model_config = ConfigDict(extra="forbid")

    text: str
    delivery_note: str = Field(..., description="语气/节奏提示")


class BodySegment(BaseModel):
    """正文段落。"""

    model_config = ConfigDict(extra="forbid")

    segment: int
    text: str
    delivery_note: str


class CopywriterOutput(BaseModel):
    """文案 Agent 输出。"""

    model_config = ConfigDict(extra="forbid")

    hook: HookSegment
    body: list[BodySegment] = Field(..., min_length=2, max_length=4)
    cta: HookSegment
    full_script: str
    estimated_duration_seconds: int
    word_count: int


# ============================================================
# 脚本 Agent（Scriptwriter）
# ============================================================
class BgmSuggestion(BaseModel):
    """BGM 建议。"""

    model_config = ConfigDict(extra="forbid")

    style: str
    bpm_range: str
    mood: str
    reference: str


class Shot(BaseModel):
    """单镜头分镜。"""

    model_config = ConfigDict(extra="forbid")

    shot_id: int
    start_time: str
    end_time: str
    duration_seconds: int
    shot_type: str
    camera_movement: str
    visual_description: str
    voiceover: str
    text_overlay: str | None = None
    sound_effects: str | None = None
    transition: str


class ScriptwriterOutput(BaseModel):
    """脚本 Agent 输出。"""

    model_config = ConfigDict(extra="forbid")

    title: str
    total_duration_seconds: int
    bgm_suggestion: BgmSuggestion
    shots: list[Shot]
    production_notes: str


# ============================================================
# 视觉 Agent（Visual Designer）
# ============================================================
class VisualStyle(BaseModel):
    """整体视觉风格。"""

    model_config = ConfigDict(extra="forbid")

    style: str
    color_palette: str
    aspect_ratio: str
    quality_tags: str


class ShotPrompt(BaseModel):
    """单镜头 AI 生图 prompt。"""

    model_config = ConfigDict(extra="forbid")

    shot_id: int
    prompt: str = Field(..., description="英文 AI 生图 prompt")
    negative_prompt: str
    recommended_tool: str
    aspect_ratio: str
    reference_style: str

    @model_validator(mode="before")
    @classmethod
    def normalize_shot_id(cls, data):
        """兼容 LLM 偶发将 shot_id 写成 pitch_id 的情况。"""
        if isinstance(data, dict) and "shot_id" not in data and "pitch_id" in data:
            data = dict(data)
            data["shot_id"] = data.pop("pitch_id")
        return data


class VisualOutput(BaseModel):
    """视觉 Agent 输出。"""

    model_config = ConfigDict(extra="forbid")

    visual_style: VisualStyle
    shot_prompts: list[ShotPrompt]
    consistency_guide: str


# ============================================================
# 投放 Agent（Distributor）
# ============================================================
class VideoSpecs(BaseModel):
    """视频规格。"""

    model_config = ConfigDict(extra="forbid")

    resolution: str
    aspect_ratio: str
    max_duration: str
    file_format: str
    fps: int


class PublishContent(BaseModel):
    """发布内容。"""

    model_config = ConfigDict(extra="forbid")

    title: str
    description: str
    hashtags: list[str]
    mention: str | None = None


class PublishStrategy(BaseModel):
    """发布策略。"""

    model_config = ConfigDict(extra="forbid")

    best_time: str
    best_days: list[str]
    frequency: str
    first_comment: str


class PromotionSuggestion(BaseModel):
    """推广建议。"""

    model_config = ConfigDict(extra="forbid")

    type: str
    description: str
    budget_hint: str | None = None


class DistributorOutput(BaseModel):
    """投放 Agent 输出。"""

    model_config = ConfigDict(extra="forbid")

    platform: str
    video_specs: VideoSpecs
    publish_content: PublishContent
    publish_strategy: PublishStrategy
    promotion_suggestions: list[PromotionSuggestion]
    platform_specific_notes: str


# ============================================================
# 用户输入模型（FastAPI 请求体）
# ============================================================
class UserInput(BaseModel):
    """用户输入的农产品信息。"""

    model_config = ConfigDict(extra="forbid")

    product_name: str
    origin: str
    category: str
    selling_points: str
    target_platform: str = "抖音"
    target_duration: str = "30-60秒"
    additional_info: str | None = None
