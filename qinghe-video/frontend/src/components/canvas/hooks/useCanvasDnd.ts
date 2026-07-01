/**
 * 拖拽创建节点 hook。
 *
 * - onDragStart(e, kind, preset?)：工具栏项拖拽开始时写入 dataTransfer（kind + 可选 preset JSON）
 * - onDrop(e)：画布接收 drop，用 screenToFlowPosition 计算落点坐标 → makeDefaultNode(kind, position, preset) → addNode
 * - onDragOver(e)：必须 preventDefault 才能触发 drop
 * - setReactFlowInstance：CanvasFlow 的 onInit 回调用它注入实例
 *
 * 用法：CanvasFlow 绑定 onDrop/onDragOver/onInit；CanvasToolbar 绑定 onDragStart。
 */
import { useCallback, useState } from "react";
import type { Edge, ReactFlowInstance } from "@xyflow/react";
import { useCanvasStore } from "@/stores/canvas-store";
import { makeDefaultNode } from "@/components/canvas/nodeFactory";
import type { CanvasNode, CanvasNodeData, CanvasNodeKind } from "@/components/canvas/types";

const DND_MIME = "application/reactflow";
const DND_PRESET_MIME = "application/reactflow-preset";

export function useCanvasDnd() {
  const [rfInstance, setRfInstance] =
    useState<ReactFlowInstance<CanvasNode, Edge> | null>(null);

  const onDragStart = useCallback(
    (
      e: React.DragEvent,
      kind: CanvasNodeKind,
      preset?: Partial<CanvasNodeData>,
    ) => {
      e.dataTransfer.setData(DND_MIME, kind);
      e.dataTransfer.effectAllowed = "move";
      if (preset) {
        e.dataTransfer.setData(DND_PRESET_MIME, JSON.stringify(preset));
      }
    },
    [],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(DND_MIME) as CanvasNodeKind | "";
      if (!kind || !rfInstance) return;
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      // 读取可选 preset（如 prompt 的 role）
      let preset: Partial<CanvasNodeData> | undefined;
      const presetRaw = e.dataTransfer.getData(DND_PRESET_MIME);
      if (presetRaw) {
        try {
          preset = JSON.parse(presetRaw) as Partial<CanvasNodeData>;
        } catch {
          /* ignore malformed preset */
        }
      }
      const node = makeDefaultNode(kind, position, preset);
      useCanvasStore.getState().addNode(node);
    },
    [rfInstance],
  );

  return {
    onDragStart,
    onDrop,
    onDragOver,
    setReactFlowInstance: setRfInstance,
  };
}
