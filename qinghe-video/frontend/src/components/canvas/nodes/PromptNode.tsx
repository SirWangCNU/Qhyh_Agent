/**
 * 提示词节点。
 *
 * - 一个提示词 Textarea
 * - 右侧 source Handle：拉线到生成节点
 *
 * 多个提示词节点的文本在生成时按入边收集并换行拼接。
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasStore } from "@/stores/canvas-store";
import type { PromptNodeData } from "@/components/canvas/types";
import { cn } from "@/lib/utils";

export function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as PromptNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  return (
    <Card
      className={cn(
        "w-64 gap-0 p-0 shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1.5">
        <span className="text-xs">✍️ 提示词</span>
      </div>
      <div className="p-2.5">
        <Textarea
          value={d.prompt}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="描述想要生成的内容…"
          className="h-28 resize-none text-xs"
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </Card>
  );
}
