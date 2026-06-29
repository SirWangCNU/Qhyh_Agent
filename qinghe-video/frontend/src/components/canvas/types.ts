/**
 * 无限画布节点数据类型与常量。
 *
 * 与后端 src/canvas/models.py 的 RefType / GenerateStatus 对齐，
 * 参考图四维分类对标即梦 AI（内容 / 风格 / 结构 / 姿态）。
 */
import type { Node, Edge } from "@xyflow/react";

/** 参考图维度（对标即梦四维参考图）。 */
export type RefType = "content" | "style" | "structure" | "pose";

/** 生成节点状态。 */
export type GenerateStatus = "idle" | "running" | "done" | "error";

/** 生成模式：图片 / 视频。 */
export type GenerateMode = "image" | "video";

/** 画布节点种类。 */
export type CanvasNodeKind = "referenceImage" | "prompt" | "generate" | "image";

/** 参考图节点数据。 */
export interface ReferenceImageNodeData {
  kind: "referenceImage";
  imageUrl: string | null;
  refType: RefType;
  /** 用户可改的备注名。 */
  label: string;
  [key: string]: unknown;
}

/** 提示词节点数据。 */
export interface PromptNodeData {
  kind: "prompt";
  prompt: string;
  [key: string]: unknown;
}

/** 生成节点数据。 */
export interface GenerateNodeData {
  kind: "generate";
  status: GenerateStatus;
  /** 生成类型：图片（已接入 Seedream）/ 视频（暂未接入）。 */
  mode: GenerateMode;
  /** "1024x1024" | "1920x1920" 等。 */
  size: string;
  /** 本次生成使用的模型 id（兜底 FALLBACK_MODEL）。 */
  model: string;
  /** 节点内置主提示词。 */
  prompt: string;
  /** 负向提示词（可选）。 */
  negative_prompt: string;
  error?: string;
  [key: string]: unknown;
}

/** 结果图节点数据。 */
export interface ImageNodeData {
  kind: "image";
  imageUrl: string | null;
  /** 关联的生成节点 id。 */
  sourceGenerateNodeId?: string;
  /** 中文序号标签，如 "一"、"二"。 */
  label: string;
  /** 数字序号，从 1 开始。 */
  index: number;
  [key: string]: unknown;
}

/** 画布节点数据联合类型。 */
export type CanvasNodeData =
  | ReferenceImageNodeData
  | PromptNodeData
  | GenerateNodeData
  | ImageNodeData;

export type CanvasNode = Node<CanvasNodeData>;
export type CanvasEdge = Edge;

/** 参考图类型选项（含颜色点）。 */
export const REF_TYPE_OPTIONS: {
  value: RefType;
  label: string;
  color: string;
}[] = [
  { value: "content", label: "内容", color: "#3b82f6" },
  { value: "style", label: "风格", color: "#a855f7" },
  { value: "structure", label: "结构", color: "#f59e0b" },
  { value: "pose", label: "姿态", color: "#ec4899" },
];

/** 生成尺寸选项。 */
export const SIZE_OPTIONS = [
  "1024x1024",
  "1920x1920",
  "1024x1792",
  "1792x1024",
];

/**
 * 模型兜底列表：当后端 /api/canvas/models 不可用时使用。
 * 与后端 settings.IMAGE_MODEL 默认值保持一致。
 */
export const FALLBACK_MODEL = "doubao-seedream-5-0-260128";
export const FALLBACK_MODEL_OPTIONS: string[] = [FALLBACK_MODEL];

/** 生成模式选项。 */
export const MODE_OPTIONS: { value: GenerateMode; label: string }[] = [
  { value: "image", label: "生图片" },
  { value: "video", label: "生视频" },
];

/** 工具栏拖拽项元信息。 */
export const TOOLBAR_ITEMS: {
  kind: CanvasNodeKind;
  label: string;
  emoji: string;
}[] = [
  { kind: "referenceImage", label: "参考图", emoji: "🖼️" },
  { kind: "prompt", label: "提示词", emoji: "✍️" },
  { kind: "generate", label: "生成", emoji: "⚡" },
  { kind: "image", label: "结果图", emoji: "📷" },
];

/** 生成状态 → Badge 配置。 */
export const GENERATE_STATUS_META: Record<
  GenerateStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warn" | "outline" }
> = {
  idle: { label: "待生成", variant: "secondary" },
  running: { label: "生成中", variant: "default" },
  done: { label: "已完成", variant: "success" },
  error: { label: "失败", variant: "destructive" },
};

/**
 * 连线合法性：仅允许参考图/提示词 → 生成；生成 → 结果图。
 * srcKind / tgtKind 取自节点 data.kind。
 */
export function isValidConnection(
  srcKind: string,
  tgtKind: string,
): boolean {
  if (
    tgtKind === "generate" &&
    (srcKind === "referenceImage" || srcKind === "prompt")
  ) {
    return true;
  }
  if (tgtKind === "image" && srcKind === "generate") {
    return true;
  }
  return false;
}
