/**
 * 分镜节点（故事板模式专用）。
 *
 * - 左侧 target Handle：接收参考图 / 提示词节点的入边
 * - 右侧 source Handle：可拉线到生成节点
 * - 节点内置：镜号标题 + 状态徽章 / 画面描述 / 旁白 / 时长 / 缩略图 + 生成按钮
 * - 生成通过 useCanvasStoryboard.generateShot 触发（直接调批量 API 单镜版）
 * - running 时禁用按钮；error 时显示错误文案；done 时显示结果图
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles, Loader2, ImageIcon, Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCanvasStore } from "@/stores/canvas-store";
import { useCanvasStoryboard } from "@/components/canvas/hooks/useCanvasStoryboard";
import {
  GENERATE_STATUS_META,
  type ShotNodeData,
} from "@/components/canvas/types";

export function ShotNode({ id, data }: NodeProps) {
  const d = data as ShotNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { generateShot, isGenerating } = useCanvasStoryboard();

  const statusMeta = GENERATE_STATUS_META[d.status] ?? GENERATE_STATUS_META.idle;
  const running = d.status === "running" || isGenerating;

  const displayImage = d.resultImageUrl || d.referenceImageUrl;

  return (
    <Card className="w-64 gap-0 p-0 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b bg-orange-500/5 px-2.5 py-1.5">
        <CardTitle className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Film className="h-3.5 w-3.5 shrink-0 text-orange-500" />
          <span className="shrink-0 rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
            SHOT
          </span>
          <input
            value={d.title}
            onChange={(e) => updateNodeData(id, { title: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground outline-none focus:border-b focus:border-orange-500"
            disabled={running}
          />
        </CardTitle>
        <Badge variant={statusMeta.variant} className="shrink-0 text-[10px]">
          {statusMeta.label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-2 p-2.5">
        {/* 画面描述 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            画面描述 / 提示词
          </label>
          <textarea
            value={d.visualPrompt}
            onChange={(e) =>
              updateNodeData(id, { visualPrompt: e.target.value })
            }
            placeholder="本镜画面描述…"
            disabled={running}
            className="h-20 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* 旁白 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            旁白
          </label>
          <textarea
            value={d.narration}
            onChange={(e) => updateNodeData(id, { narration: e.target.value })}
            placeholder="本镜旁白文本…"
            disabled={running}
            className="h-12 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* 时长 + 参考图类型 */}
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              时长(秒)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={d.duration}
              onChange={(e) =>
                updateNodeData(id, {
                  duration: Math.max(0.1, Number(e.target.value) || 3.5),
                })
              }
              disabled={running}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              参考类型
            </label>
            <select
              value={d.referenceType ?? ""}
              onChange={(e) =>
                updateNodeData(id, {
                  referenceType: (e.target.value || undefined) as
                    | ShotNodeData["referenceType"]
                    | undefined,
                })
              }
              disabled={running}
              className="h-8 w-full rounded-md border border-input bg-background px-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">自动</option>
              <option value="character">人物</option>
              <option value="object">物品</option>
              <option value="scene">场景</option>
            </select>
          </div>
        </div>

        {/* 缩略图：优先结果图，其次参考图 */}
        {displayImage ? (
          <img
            src={displayImage}
            alt={d.title}
            className={
              "h-28 w-full rounded border object-contain" +
              (d.resultImageUrl ? " ring-1 ring-emerald-400/50" : "")
            }
          />
        ) : (
          <div className="flex h-20 w-full items-center justify-center rounded border border-dashed text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}

        {/* 生成按钮 */}
        <Button
          size="sm"
          className="h-8 w-full bg-orange-600 text-xs hover:bg-orange-700"
          disabled={running || !d.visualPrompt.trim()}
          onClick={() => generateShot(id)}
        >
          {running ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              生成中…
            </>
          ) : d.status === "done" ? (
            <>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              重新生成
            </>
          ) : (
            <>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              生成此镜
            </>
          )}
        </Button>

        {/* 错误提示 */}
        {d.status === "error" && d.error && (
          <p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {d.error}
          </p>
        )}
      </CardContent>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-orange-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-orange-500"
      />
    </Card>
  );
}
