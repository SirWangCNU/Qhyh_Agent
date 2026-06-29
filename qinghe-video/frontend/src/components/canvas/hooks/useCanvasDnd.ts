/**
 * 拖拽创建节点 hook。
 *
 * - onDragStart(e, kind)：工具栏项拖拽开始时写入 dataTransfer
 * - onDrop(e)：画布接收 drop，用 screenToFlowPosition 计算落点坐标 → makeDefaultNode → addNode
 * - onDragOver(e)：必须 preventDefault 才能触发 drop
 * - setReactFlowInstance：CanvasFlow 的 onInit 回调用它注入实例
 *
 * 用法：CanvasFlow 绑定 onDrop/onDragOver/onInit；CanvasToolbar 绑定 onDragStart。
 */
import { useCallback, useState } from "react";
import type { Edge, ReactFlowInstance } from "@xyflow/react";
import { useCanvasStore } from "@/stores/canvas-store";
import { makeDefaultNode } from "@/components/canvas/nodeFactory";
import type { CanvasNode, CanvasNodeKind } from "@/components/canvas/types";

const DND_MIME = "application/reactflow";

export function useCanvasDnd() {
  const [rfInstance, setRfInstance] =
    useState<ReactFlowInstance<CanvasNode, Edge> | null>(null);

  const onDragStart = useCallback(
    (e: React.DragEvent, kind: CanvasNodeKind) => {
      e.dataTransfer.setData(DND_MIME, kind);
      e.dataTransfer.effectAllowed = "move";
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
      const node = makeDefaultNode(kind, position);
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
