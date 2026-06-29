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
      return { kind: "prompt", prompt: "" };
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
  }
}

/** 创建一个默认节点（拖拽落点用）。 */
export function makeDefaultNode(
  kind: CanvasNodeKind,
  position: XYPosition,
): CanvasNode {
  return {
    id: makeNodeId(),
    type: kind,
    position,
    data: defaultNodeData(kind),
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
