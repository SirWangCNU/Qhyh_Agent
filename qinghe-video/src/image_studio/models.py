"""图像处理工作室 Pydantic 模型。

遵循项目约定：所有模型 extra="forbid"，字段名与 prompt .md 中 JSON 键名严格一致。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ImageStudioRequest(BaseModel):
    """工作室请求参数（JSON 体，文件单独用 UploadFile 传输）。"""

    model_config = ConfigDict(extra="forbid")

    image_type: Literal["person", "product"] = Field(
        ..., description="参考图类型：person 人物图 / product 物品图"
    )
    subject: str = Field(..., min_length=1, max_length=200, description="创作主题描述")
    style_preference: str | None = Field(
        None, description="可选风格偏好，如「简约现代」「复古胶片」"
    )
    size: str | None = Field(
        None, description="单图尺寸，如 1024x1024；留空取默认 1024x1024"
    )


class StyleVariant(BaseModel):
    """单个风格变体（LLM 结构化输出的一项）。"""

    model_config = ConfigDict(extra="forbid")

    variant_id: int = Field(..., description="1-9，对应 9 个维度")
    dimension: str = Field(
        ...,
        description="维度英文键名：lighting/perspective/scene/color_tone/composition/mood/material/lens/art_style",
    )
    dimension_label: str = Field(..., description="维度中文标签，如「光照·黄金时刻」")
    prompt: str = Field(..., description="英文生图 prompt，含一致性关键特征")
    negative_prompt: str = Field(..., description="英文负向提示词")


class DirectorBoardOutput(BaseModel):
    """LLM 生成的 9 变体结构化输出。"""

    model_config = ConfigDict(extra="forbid")

    image_type: str = Field(..., description="回传的参考图类型")
    subject: str = Field(..., description="回传的创作主题")
    consistency_key: str = Field(
        ..., description="从参考图提取的人物/物品关键特征英文描述，9 个变体的共同锚点"
    )
    variants: list[StyleVariant] = Field(..., description="9 个风格变体列表")


class VariantImageResult(BaseModel):
    """单张变体图生成结果（调用 doubao-seedream 后）。"""

    model_config = ConfigDict(extra="forbid")

    variant_id: int
    dimension_label: str
    prompt: str
    image_url: str | None = Field(
        None, description="生成图的相对 URL，如 /outputs/image/variant_1_xxx.jpg"
    )
    b64_json: str | None = None
    error: str | None = Field(None, description="失败时的错误信息，成功时为 None")


class GridResult(BaseModel):
    """九宫格导演板最终结果。"""

    model_config = ConfigDict(extra="forbid")

    grid_url: str = Field(..., description="九宫格图相对 URL，如 /outputs/image/grid_xxx.jpg")
    variants: list[VariantImageResult] = Field(..., description="9 张变体图结果")
    consistency_key: str = Field(..., description="一致性关键特征描述")
    subject: str = Field(..., description="创作主题")
