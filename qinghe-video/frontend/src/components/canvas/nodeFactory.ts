/**
 * 画布节点工厂：按种类生成默认节点数据 + 唯一 id。
 *
 * 供 useCanvasDnd（拖拽创建）与 useCanvasGenerate（生成结果图）共用，
 * 避免重复实现并保证默认值一致。
 */
import type { XYPosition } from "@xyflow/react";
import type {
  CanvasNode,
  CanvasNodeData,
  CanvasNodeKind,
  ImageNodeData,
  PromptRole,
  SegmentNodeData,
  ShotNodeData,
} from "@/components/canvas/types";
import { FALLBACK_MODEL } from "@/components/canvas/types";

/** 生成唯一节点 id（crypto.randomUUID 现代浏览器原生支持）。 */
export function makeNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 1-99 → 中文数字（仅用于结果图序号显示，如「图片一」「图片十二」）。 */
export function toChineseNumber(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "?";
  if (n > 99) return String(n);
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return digits[n];
  if (n < 20) return n === 10 ? "十" : `十${digits[n - 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0
    ? `${digits[tens]}十`
    : `${digits[tens]}十${digits[ones]}`;
}

/** 按 kind 生成默认节点 data。 */
export function defaultNodeData(kind: CanvasNodeKind): CanvasNodeData {
  switch (kind) {
    case "referenceImage":
      return {
        kind: "referenceImage",
        imageUrl: null,
        refType: "content",
        label: "参考图",
      };
    case "prompt":
      return { kind: "prompt", prompt: "", role: "generic" };
    case "generate":
      return {
        kind: "generate",
        status: "idle",
        mode: "image",
        size: "1024x1024",
        model: FALLBACK_MODEL,
        prompt: "",
        negative_prompt: "",
      };
    case "image":
      return { kind: "image", imageUrl: null, label: "", index: 0 };
    case "shot":
      return {
        kind: "shot",
        shotId: "",
        title: "新分镜",
        visualPrompt: "",
        narration: "",
        duration: 3.5,
        status: "idle",
      };
    case "segment":
      return {
        kind: "segment",
        segmentId: "",
        title: "新片段",
        storyboardText: "",
        systemPrompt: "",
        status: "idle",
      };
  }
}

/** 创建一个默认节点（拖拽落点用）。
 *
 * @param preset 预设 data，会合并到默认值之上（如 prompt 的 role）。
 */
export function makeDefaultNode(
  kind: CanvasNodeKind,
  position: XYPosition,
  preset?: Partial<CanvasNodeData>,
): CanvasNode {
  return {
    id: makeNodeId(),
    type: kind,
    position,
    data: { ...defaultNodeData(kind), ...preset } as CanvasNodeData,
  };
}

/** 创建结果图节点（生成成功后自动放置在生成节点右侧）。
 *
 * @param index 结果图序号（从 1 开始），用于显示「图片一/二…」。
 */
export function makeImageNode(
  imageUrl: string,
  genPosition: XYPosition,
  sourceGenerateNodeId: string,
  index: number,
): { node: CanvasNode; data: ImageNodeData } {
  const data: ImageNodeData = {
    kind: "image",
    imageUrl,
    sourceGenerateNodeId,
    label: toChineseNumber(index),
    index,
  };
  const node: CanvasNode = {
    id: makeNodeId(),
    type: "image",
    // 放在生成节点右侧偏下，避免重叠（生成节点宽约 240px）
    position: { x: genPosition.x + 280, y: genPosition.y + 60 },
    data,
  };
  return { node, data };
}

// ============================================================
// 故事板分镜节点
// ============================================================

/** 创建一个提示词节点（指定 role，导出流程 / 工具栏预设用）。
 *
 * @param role system=系统提示词 / storyboard=故事板文本 / generic=通用
 */
export function makePromptNode(
  role: PromptRole,
  prompt: string,
  position: XYPosition,
  label?: string,
): CanvasNode {
  return {
    id: makeNodeId(),
    type: "prompt",
    position,
    data: { kind: "prompt", prompt, role, label },
  };
}

/** 创建一个参考图节点（预设 imageUrl，导出流程用）。 */
export function makeReferenceImageNode(
  url: string,
  position: XYPosition,
  label = "参考图",
): CanvasNode {
  return {
    id: makeNodeId(),
    type: "referenceImage",
    position,
    data: { kind: "referenceImage", imageUrl: url, refType: "content", label },
  };
}

/** 单个分镜的导入数据（来自工坊 scriptwriter + visual_designer）。 */
export interface ShotImport {
  shotId: string;
  title: string;
  visualPrompt: string;
  narration: string;
  duration: number;
  referenceImageUrl?: string;
  referenceType?: "character" | "object" | "scene";
}

/** 从工坊 shot 数据创建 ShotNode。 */
export function makeShotNode(
  shot: ShotImport,
  position: XYPosition,
): CanvasNode {
  const data: ShotNodeData = {
    kind: "shot",
    shotId: shot.shotId,
    title: shot.title || `分镜 ${shot.shotId}`,
    visualPrompt: shot.visualPrompt,
    narration: shot.narration ?? "",
    duration: shot.duration ?? 3.5,
    referenceImageUrl: shot.referenceImageUrl,
    referenceType: shot.referenceType,
    status: "idle",
  };
  return {
    id: makeNodeId(),
    type: "shot",
    position,
    data,
  };
}

/** 故事板自动布局参数。 */
export interface StoryboardLayoutOptions {
  /** 起始坐标。 */
  startX?: number;
  startY?: number;
  /** 行间距（纵向排列时每个分镜的垂直间距）。 */
  rowGap?: number;
  /** 列间距（横向排列时每个分镜的水平间距，预留未用）。 */
  colGap?: number;
  /** 每行分镜数，超过则换行。 */
  perRow?: number;
}

/**
 * 按纵向瀑布流排列分镜节点坐标。
 *
 * 默认每个 ShotNode 占一行：x = startX, y = startY + index * rowGap。
 * perRow > 1 时按网格换行排列。
 *
 * 返回与 shots 等长的坐标数组，顺序一致。
 */
export function layoutStoryboardShots(
  count: number,
  options: StoryboardLayoutOptions = {},
): XYPosition[] {
  const {
    startX = 0,
    startY = 0,
    rowGap = 240,
    colGap = 320,
    perRow = 1,
  } = options;
  const positions: XYPosition[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    positions.push({
      x: startX + col * colGap,
      y: startY + row * rowGap,
    });
  }
  return positions;
}

/** 批量创建 ShotNode 阵列（按 layout 排列）。 */
export function makeShotNodes(
  shots: ShotImport[],
  options: StoryboardLayoutOptions = {},
): CanvasNode[] {
  const positions = layoutStoryboardShots(shots.length, options);
  return shots.map((shot, i) => makeShotNode(shot, positions[i]!));
}

// ============================================================
// 段级故事板节点（Segment-level Director Board）
// ============================================================

/** 单个段级故事板的导入数据（来自工坊 scriptwriter_output.segments）。 */
export interface SegmentImport {
  segmentId: string;
  title: string;
  /** 04b 故事板文本。 */
  storyboardText: string;
  /** 本段系统提示词；未传则用画布级 systemPrompt。 */
  systemPrompt?: string;
}

/**
 * 从工坊 segment 数据创建 StoryboardSegmentNode。
 *
 * @param systemPrompt 画布级系统提示词（来自 canvas-store），作为本段默认值；
 *                    若 seg.systemPrompt 显式传入则覆盖。
 */
export function makeSegmentNode(
  seg: SegmentImport,
  position: XYPosition,
  systemPrompt: string,
): CanvasNode {
  const data: SegmentNodeData = {
    kind: "segment",
    segmentId: seg.segmentId,
    title: seg.title || `片段 ${seg.segmentId}`,
    storyboardText: seg.storyboardText,
    systemPrompt: seg.systemPrompt ?? systemPrompt,
    status: "idle",
  };
  return {
    id: makeNodeId(),
    type: "segment",
    position,
    data,
  };
}

/**
 * 批量创建 StoryboardSegmentNode 阵列（按 layout 纵向排列）。
 *
 * 段节点比 ShotNode 高（含 04b 文本展示），建议调用方传 rowGap ≥ 420。
 */
export function makeSegmentNodes(
  segments: SegmentImport[],
  options: StoryboardLayoutOptions = {},
  systemPrompt: string,
): CanvasNode[] {
  const positions = layoutStoryboardShots(segments.length, options);
  return segments.map((seg, i) =>
    makeSegmentNode(seg, positions[i]!, systemPrompt),
  );
}
