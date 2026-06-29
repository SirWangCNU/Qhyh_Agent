"""一致性生图 Pydantic 模型。

所有模型 ConfigDict(extra="forbid")，遵循项目约定。
注意：ConsistencyImageRequest 仅用于内部校验/文档，实际路由用 Form 字段接收。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ConsistencyImageRequest(BaseModel):
    """一致性生图请求（内部校验模型，实际路由用 Form）。"""

    model_config = ConfigDict(extra="forbid")

    image_type: Literal["character", "object", "scene"] = Field(
        description="参考图类型：character/object/scene"
    )
    subject: str = Field(min_length=1, description="主体描述")
    style_preference: str | None = Field(None, description="可选风格偏好")
    size: str | None = Field(None, description="图像尺寸，如 1920x1920")
    negative_prompt: str | None = Field(None, description="负向提示词")


class ConsistencyImageResult(BaseModel):
    """一致性生图结果（单张合成大图）。"""

    model_config = ConfigDict(extra="forbid")

    image_type: Literal["character", "object", "scene"]
    image_url: str
    prompt: str
    consistency_mode: Literal["image_to_image", "text_to_image"]
    subject: str
