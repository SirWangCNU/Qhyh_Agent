/**
 * 生成节点。
 *
 * - 左侧 target Handle：接收参考图 / 提示词节点的入边
 * - 右侧 source Handle：可拉线到结果图 / 结果视频节点
 * - 节点内置：生成类型 / 模型 / 尺寸 / 提示词 / 负向提示词 + 生成按钮 + 状态 Badge
 * - 提示词输入支持 `@` 引用画布图片素材（PromptMentionTextarea）
 * - running 时禁用按钮；error 时显示错误文案
 */
import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanvasStore } from "@/stores/canvas-store";
import { useCanvasGenerate } from "@/components/canvas/hooks/useCanvasGenerate";
import { useCanvasModels, useCanvasVideoModels } from "@/hooks/use-canvas";
import { PromptMentionTextarea } from "@/components/canvas/shared/PromptMentionTextarea";
import {
  FALLBACK_MODEL,
  FALLBACK_MODEL_OPTIONS,
  FALLBACK_VIDEO_MODEL,
  FALLBACK_VIDEO_MODEL_OPTIONS,
  GENERATE_STATUS_META,
  IMAGE_SIZE_OPTIONS,
  MODE_OPTIONS,
  VIDEO_RATIO_OPTIONS,
  VIDEO_SIZE_OPTIONS,
  type GenerateNodeData,
} from "@/components/canvas/types";
import { cn } from "@/lib/utils";
import { NodeDeleteButton } from "@/components/canvas/nodes/shared/NodeDeleteButton";

export function GenerateNode({ id, data, selected }: NodeProps) {
  const d = data as GenerateNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { runGenerate, isPending } = useCanvasGenerate();
  const [showNegative, setShowNegative] = useState(false);

  // 兜底：旧节点可能缺少新字段
  const model = d.model ?? "";
  const prompt = d.prompt ?? "";
  const negativePrompt = d.negative_prompt ?? "";

  const isVideo = d.mode === "video";

  const imageModelsQuery = useCanvasModels();
  const videoModelsQuery = useCanvasVideoModels();
  const modelOptions = isVideo
    ? videoModelsQuery.data && videoModelsQuery.data.length > 0
      ? videoModelsQuery.data
      : FALLBACK_VIDEO_MODEL_OPTIONS
    : imageModelsQuery.data && imageModelsQuery.data.length > 0
      ? imageModelsQuery.data
      : FALLBACK_MODEL_OPTIONS;

  const sizeOptions = isVideo ? VIDEO_SIZE_OPTIONS : IMAGE_SIZE_OPTIONS;

  const statusMeta = GENERATE_STATUS_META[d.status] ?? GENERATE_STATUS_META.idle;
  const running = d.status === "running" || isPending;

  return (
    <Card
      className={cn(
        "group relative w-64 gap-0 p-0 shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
      <NodeDeleteButton nodeId={id} disabled={running} />
      <div className="flex items-center justify-between border-b bg-muted/40 px-2.5 py-1.5">
        <span className="text-xs">⚡ 生成</span>
        <Badge variant={statusMeta.variant} className="text-[10px]">
          {statusMeta.label}
        </Badge>
      </div>

      <div className="space-y-2 p-2.5">
        <label className="text-[11px] font-medium text-muted-foreground">
          生成类型
        </label>
        <Select
          value={d.mode}
          onValueChange={(v) => {
            const mode = v as GenerateNodeData["mode"];
            updateNodeData(id, {
              mode,
              status: "idle",
              error: undefined,
              size: mode === "video" ? "720p" : "1024x1024",
              model:
                mode === "video" ? FALLBACK_VIDEO_MODEL : FALLBACK_MODEL,
            });
          }}
          disabled={running}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue className="truncate" />
          </SelectTrigger>
          <SelectContent>
            {MODE_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="text-[11px] font-medium text-muted-foreground">
          模型
        </label>
        <Select
          value={model}
          onValueChange={(v) => updateNodeData(id, { model: v })}
          disabled={running}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue className="truncate" />
          </SelectTrigger>
          <SelectContent className="w-[var(--radix-select-trigger-width)]">
            {modelOptions.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                <span className="block truncate" title={m}>
                  {m}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="text-[11px] font-medium text-muted-foreground">
          {isVideo ? "分辨率" : "输出尺寸"}
        </label>
        <Select
          value={d.size}
          onValueChange={(v) => updateNodeData(id, { size: v })}
          disabled={running}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue className="truncate" />
          </SelectTrigger>
          <SelectContent>
            {sizeOptions.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isVideo && (
          <VideoParamsEditor
            nodeId={id}
            data={d}
            disabled={running}
            onUpdate={updateNodeData}
          />
        )}

        <label className="text-[11px] font-medium text-muted-foreground">
          提示词（输入 @ 引用图片）
        </label>
        <PromptMentionTextarea
          value={prompt}
          onChange={(v) => updateNodeData(id, { prompt: v })}
          placeholder="描述想要生成的内容，@ 引用画布图片…"
          className="h-24"
          disabled={running}
        />

        <button
          type="button"
          onClick={() => setShowNegative((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          {showNegative ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          负向提示词
        </button>
        {showNegative && (
          <textarea
            value={negativePrompt}
            onChange={(e) =>
              updateNodeData(id, { negative_prompt: e.target.value })
            }
            placeholder="不希望出现的元素…"
            disabled={running}
            className="h-16 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        )}

        <Button
          size="sm"
          className="h-8 w-full text-xs"
          disabled={running}
          onClick={() => runGenerate(id)}
        >
          {running ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              生成中…
            </>
          ) : (
            <>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              生成
            </>
          )}
        </Button>

        {d.status === "error" && d.error && (
          <p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {d.error}
          </p>
        )}
      </div>

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

/** 视频专属参数表单。 */
function VideoParamsEditor({
  nodeId,
  data,
  disabled,
  onUpdate,
}: {
  nodeId: string;
  data: GenerateNodeData;
  disabled: boolean;
  onUpdate: (id: string, patch: Partial<GenerateNodeData>) => void;
}) {
  const ratio = data.ratio ?? "9:16";
  const duration = Number(data.duration ?? 8);
  const generateAudio = data.generate_audio ?? true;
  const watermark = data.watermark ?? false;

  return (
    <div className="space-y-2">
      <label className="text-[11px] font-medium text-muted-foreground">
        宽高比
      </label>
      <Select
        value={ratio}
        onValueChange={(v) => onUpdate(nodeId, { ratio: v })}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue className="truncate" />
        </SelectTrigger>
        <SelectContent>
          {VIDEO_RATIO_OPTIONS.map((r) => (
            <SelectItem key={r} value={r} className="text-xs">
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="text-[11px] font-medium text-muted-foreground">
        时长（秒）
      </label>
      <input
        type="number"
        min={3}
        max={15}
        step={1}
        value={duration}
        disabled={disabled}
        onChange={(e) =>
          onUpdate(nodeId, { duration: Number(e.target.value) })
        }
        className="h-8 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />

      <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <input
          type="checkbox"
          checked={generateAudio}
          disabled={disabled}
          onChange={(e) =>
            onUpdate(nodeId, { generate_audio: e.target.checked })
          }
          className="h-3.5 w-3.5 rounded border-gray-300"
        />
        生成音频
      </label>

      <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <input
          type="checkbox"
          checked={watermark}
          disabled={disabled}
          onChange={(e) =>
            onUpdate(nodeId, { watermark: e.target.checked })
          }
          className="h-3.5 w-3.5 rounded border-gray-300"
        />
        添加水印
      </label>
    </div>
  );
}
