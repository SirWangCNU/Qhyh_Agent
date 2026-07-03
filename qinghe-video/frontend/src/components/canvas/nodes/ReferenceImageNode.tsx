/**
 * 参考图节点。
 *
 * - 顶部：参考维度 Select（内容/风格/结构/姿态，对标即梦四维参考图）+ 备注 label
 * - 中部：缩略图预览 / 上传按钮
 * - 右侧 source Handle：拉线到生成节点
 *
 * 上传走 useCanvasUpload（POST /api/canvas/upload），成功后 updateNodeData({imageUrl})。
 */
import { useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Upload, ImageOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanvasStore } from "@/stores/canvas-store";
import { useCanvasUpload } from "@/hooks/use-canvas";
import {
  REF_TYPE_OPTIONS,
  SEGMENT_REF_TYPE_OPTIONS,
  type ReferenceImageNodeData,
} from "@/components/canvas/types";
import { cn } from "@/lib/utils";
import { NodeDeleteButton } from "@/components/canvas/nodes/shared/NodeDeleteButton";

export function ReferenceImageNode({ id, data, selected }: NodeProps) {
  const d = data as ReferenceImageNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const upload = useCanvasUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refOption = REF_TYPE_OPTIONS.find((o) => o.value === d.refType);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await upload.mutateAsync(file);
      updateNodeData(id, { imageUrl: res.url });
    } catch (err) {
      console.error("[Canvas] 参考图上传失败", err);
    } finally {
      // 允许重复选同一文件
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card
      className={cn(
        "group relative w-60 gap-0 overflow-hidden p-0 shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
      <NodeDeleteButton nodeId={id} disabled={upload.isPending} />
      {/* 头部：维度选择 + 颜色点 */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-2 py-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: refOption?.color ?? "#888" }}
          title={refOption?.label}
        />
        <Select
          value={d.refType}
          onValueChange={(v) =>
            updateNodeData(id, { refType: v as ReferenceImageNodeData["refType"] })
          }
        >
          <SelectTrigger className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REF_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 段级故事板：人物/物品/场景分类（仅 content 维度时显示） */}
      {d.refType === "content" && (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1">
          <span className="text-[10px] text-muted-foreground">段类型</span>
          <Select
            value={d.segmentRefType ?? "character"}
            onValueChange={(v) =>
              updateNodeData(id, {
                segmentRefType: v as ReferenceImageNodeData["segmentRefType"],
              })
            }
          >
            <SelectTrigger className="h-6 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENT_REF_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: o.color }}
                  />
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 中部：图片预览 / 上传 */}
      <div className="relative flex h-40 items-center justify-center bg-muted/20">
        {d.imageUrl ? (
          <img
            src={d.imageUrl}
            alt={d.label}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs">未上传参考图</span>
          </div>
        )}
      </div>

      {/* 底部：上传按钮 */}
      <div className="border-t px-2 py-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          disabled={upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1 h-3.5 w-3.5" />
          {upload.isPending ? "上传中…" : d.imageUrl ? "重新上传" : "上传图片"}
        </Button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </Card>
  );
}
