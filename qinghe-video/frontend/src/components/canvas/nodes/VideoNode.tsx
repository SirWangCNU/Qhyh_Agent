/**
 * 结果视频节点。
 *
 * - 左侧 target Handle：接收生成节点的出边
 * - 右侧 source Handle：可拉线到生成节点，作为参考图/首帧输入
 * - 展示生成结果视频 + 下载链接 + 新窗口打开
 * - 空态显示「等待生成」
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Download, ExternalLink, Film } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { VideoNodeData } from "@/components/canvas/types";
import { cn } from "@/lib/utils";
import { NodeDeleteButton } from "@/components/canvas/nodes/shared/NodeDeleteButton";

export function VideoNode({ id, data, selected }: NodeProps) {
  const d = data as VideoNodeData;
  const BACKEND = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "");

  const label = d.label || (d.index ? String(d.index) : "?");
  const fullUrl = d.videoUrl ? `${BACKEND}${d.videoUrl}` : null;

  return (
    <Card
      className={cn(
        "group relative w-60 gap-0 overflow-hidden p-0 shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
      <NodeDeleteButton nodeId={id} />
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1.5">
        <span className="text-xs">🎬 视频{label}</span>
      </div>

      <div className="relative flex h-44 items-center justify-center bg-muted/20">
        {fullUrl ? (
          <video
            src={fullUrl}
            controls
            className="h-full w-full object-contain"
            preload="metadata"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Film className="h-8 w-8" />
            <span className="text-xs">等待生成</span>
          </div>
        )}
      </div>

      {fullUrl && (
        <div className="flex gap-1.5 border-t px-2 py-1.5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
          >
            <a href={fullUrl} download target="_blank" rel="noreferrer">
              <Download className="mr-1 h-3.5 w-3.5" />
              下载
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
          >
            <a href={fullUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              打开
            </a>
          </Button>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </Card>
  );
}
