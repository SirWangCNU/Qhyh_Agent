/**
 * 结果图节点。
 *
 * - 左侧 target Handle：接收生成节点的出边
 * - 展示生成结果图 + 下载链接 + 新窗口打开
 * - 空态显示「等待生成」
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Download, ExternalLink, ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ImageNodeData } from "@/components/canvas/types";
import { cn } from "@/lib/utils";

export function ImageNode({ data, selected }: NodeProps) {
  const d = data as ImageNodeData;
  const BACKEND = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "");

  // 兜底：旧项目节点可能缺少 label/index，按 index 推算或显示占位
  const label = d.label || (d.index ? String(d.index) : "?");

  return (
    <Card
      className={cn(
        "w-60 gap-0 overflow-hidden p-0 shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1.5">
        <span className="text-xs">📷 图片{label}</span>
      </div>

      <div className="relative flex h-44 items-center justify-center bg-muted/20">
        {d.imageUrl ? (
          <img
            src={d.imageUrl}
            alt="生成结果"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">等待生成</span>
          </div>
        )}
      </div>

      {d.imageUrl && (
        <div className="flex gap-1.5 border-t px-2 py-1.5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
          >
            <a
              href={`${BACKEND}${d.imageUrl}`}
              download
              target="_blank"
              rel="noreferrer"
            >
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
            <a
              href={`${BACKEND}${d.imageUrl}`}
              target="_blank"
              rel="noreferrer"
            >
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
    </Card>
  );
}
