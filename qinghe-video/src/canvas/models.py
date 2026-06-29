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
    references: list[ReferenceInput] = Field(default_factory=list, description="参考图列表")
    prompt: str = Field(..., min_length=1, description="正向提示词")
    negative_prompt: str | None = Field(None, description="负向提示词")
    params: dict[str, Any] = Field(
        default_factory=dict,
        description="生成参数：size / model / n 等",
    )


class GenerateResult(BaseModel):
    """生成结果响应。"""
    node_id: str
    status: GenerateStatus
    result_image_url: str | None = None
    error: str | None = None


class UploadResponse(BaseModel):
    """参考图上传响应。"""
    url: str = Field(..., description="可访问的相对 URL，如 /outputs/upload/xxx.jpg")
    upload_id: str = Field(..., description="上传标识（文件名）")
    filename: str
    file_size: int
