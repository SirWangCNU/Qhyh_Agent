/**
 * React Flow 主画布容器。
 *
 * - 注册 4 个自定义节点类型
 * - 绑定 store 的 onNodesChange/onEdgesChange/onConnect/onViewportChange
 * - isValidConnection 限制连线方向（参考图/提示词→生成；生成→结果图）
 * - 拖拽落点由 useCanvasDnd 处理
 * - 引入 @xyflow/react 必需的 CSS
 */
import { useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type IsValidConnection,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore } from "@/stores/canvas-store";
import { isValidConnection, type CanvasNode } from "@/components/canvas/types";
import { ReferenceImageNode } from "@/components/canvas/nodes/ReferenceImageNode";
import { PromptNode } from "@/components/canvas/nodes/PromptNode";
import { GenerateNode } from "@/components/canvas/nodes/GenerateNode";
import { ImageNode } from "@/components/canvas/nodes/ImageNode";

/** 节点类型映射（必须定义在组件外，避免每次渲染重建触发 React Flow 警告）。 */
const nodeTypes = {
  referenceImage: ReferenceImageNode,
  prompt: PromptNode,
  generate: GenerateNode,
  image: ImageNode,
};

interface CanvasFlowProps {
  /** drop 处理（来自共享 useCanvasDnd）。 */
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onInit: (instance: ReactFlowInstance<CanvasNode, Edge>) => void;
}

export function CanvasFlow({ onDrop, onDragOver, onInit }: CanvasFlowProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setSelected = useCanvasStore((s) => s.setSelected);

  /** 查节点 kind 的小工具，供 isValidConnection 回调用。 */
  const isConnValid = useMemo<IsValidConnection>(() => {
    return (conn: Connection | { source: string | null; target: string | null }) => {
      const srcId = conn.source;
      const tgtId = conn.target;
      if (!srcId || !tgtId) return false;
      const allNodes = useCanvasStore.getState().nodes;
      const src = allNodes.find((n) => n.id === srcId);
      const tgt = allNodes.find((n) => n.id === tgtId);
      if (!src || !tgt) return false;
      const srcKind = (src.data as { kind?: string }).kind ?? "";
      const tgtKind = (tgt.data as { kind?: string }).kind ?? "";
      return isValidConnection(srcKind, tgtKind);
    };
  }, []);

  return (
    <div className="h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onViewportChange={setViewport}
        onInit={onInit}
        onNodeClick={(_, node) => setSelected(node.id)}
        onPaneClick={() => setSelected(null)}
        isValidConnection={isConnValid}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: "#94a3b8", strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1.2} color="#e2e8f0" />
        <Controls className="!rounded-md !border !shadow-sm" />
        <MiniMap
          pannable
          zoomable
          className="!rounded-md !border"
          nodeColor={(n) => {
            const kind = (n.data as { kind?: string })?.kind;
            switch (kind) {
              case "referenceImage":
                return "#3b82f6";
              case "prompt":
                return "#10b981";
              case "generate":
                return "#f59e0b";
              case "image":
                return "#a855f7";
              default:
                return "#94a3b8";
            }
          }}
        />
      </ReactFlow>
    </div>
  );
}
