/**
 * 生成节点。
 *
 * - 左侧 target Handle：接收参考图 / 提示词节点的入边
 * - 右侧 source Handle：可拉线到结果图节点（结果图通常由生成成功后自动创建）
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
import { useCanvasModels } from "@/hooks/use-canvas";
import { PromptMentionTextarea } from "@/components/canvas/shared/PromptMentionTextarea";
import {
  FALLBACK_MODEL_OPTIONS,
  GENERATE_STATUS_META,
  MODE_OPTIONS,
  SIZE_OPTIONS,
  type GenerateNodeData,
} from "@/components/canvas/types";
import { cn } from "@/lib/utils";

export function GenerateNode({ id, data, selected }: NodeProps) {
  const d = data as GenerateNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { runGenerate, isPending } = useCanvasGenerate();
  const [showNegative, setShowNegative] = useState(false);

  // 兜底：旧节点可能缺少新字段
  const model = d.model ?? "";
  const prompt = d.prompt ?? "";
  const negativePrompt = d.negative_prompt ?? "";

  const modelsQuery = useCanvasModels();
  const modelOptions =
    modelsQuery.data && modelsQuery.data.length > 0
      ? modelsQuery.data
      : FALLBACK_MODEL_OPTIONS;

  const statusMeta = GENERATE_STATUS_META[d.status] ?? GENERATE_STATUS_META.idle;
  const running = d.status === "running" || isPending;
  const isVideo = d.mode === "video";

  return (
    <Card
      className={cn(
        "w-64 gap-0 p-0 shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
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
          onValueChange={(v) =>
            updateNodeData(id, {
              mode: v as GenerateNodeData["mode"],
              status: "idle",
              error: undefined,
            })
          }
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
          输出尺寸
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
            {SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
          disabled={running || isVideo}
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
              {isVideo ? "视频生成暂未接入" : "生成"}
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
