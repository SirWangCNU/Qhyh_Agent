/**
 * 段级故事板节点（生成器节点 · ComfyUI 风格）。
 *
 * 设计变更：节点不再内嵌 storyboardText / systemPrompt 文本框与资产槽。
 * 改为通过 React Flow 边收集输入（prompt 节点 + referenceImage 节点 → 本节点），
 * 由 collectSegmentInputs 在生成时按源节点 kind + role 自动分类。
 *
 * 节点结构：
 * - 顶部：Clapperboard 图标 + SEG 徽章 + 标题 + 状态徽章
 * - 入边就绪状态面板：故事板文本 / 系统提示词 / N 张参考图（✅ 已连接 / ⚠ 未连接）
 * - 结果图区（object-contain，无黑边）
 * - 操作按钮：生成导演板图 / 重新生成
 * - React Flow Handles：左 target（琥珀）/ 右 source（琥珀）
 *
 * 向后兼容：旧 SegmentNode 数据里仍有 storyboardText / systemPrompt 字段（可选），
 * 当无入边时 generateSegment 会回退到这些内嵌字段。
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Clapperboard,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Settings2,
  Images,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  useCanvasStoryboard,
  useSegmentInputs,
} from "@/components/canvas/hooks/useCanvasStoryboard";
import {
  GENERATE_STATUS_META,
  FALLBACK_MODEL_OPTIONS,
  type SegmentNodeData,
} from "@/components/canvas/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanvasModels } from "@/hooks/use-canvas";
import { cn } from "@/lib/utils";
import { NodeDeleteButton } from "@/components/canvas/nodes/shared/NodeDeleteButton";

export function StoryboardSegmentNode({ id, data }: NodeProps) {
  const d = data as SegmentNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { generateSegment, isGenerating } = useCanvasStoryboard();
  const inputs = useSegmentInputs(id);

  const modelsQuery = useCanvasModels();
  const modelOptions = modelsQuery.data && modelsQuery.data.length > 0
    ? modelsQuery.data
    : FALLBACK_MODEL_OPTIONS;

  const statusMeta = GENERATE_STATUS_META[d.status] ?? GENERATE_STATUS_META.idle;
  const running = d.status === "running" || isGenerating;
  const hasResult = !!d.resultImageUrl;

  // 入边或内嵌字段任一可用即可生成（向后兼容老项目）
  const hasStoryboardInput = inputs.hasStoryboard || !!d.storyboardText?.trim();

  return (
    <Card className="group relative w-80 gap-0 p-0 shadow-md">
      <NodeDeleteButton nodeId={id} disabled={running} />
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b bg-amber-500/5 px-2.5 py-1.5">
        <CardTitle className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Clapperboard className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
            SEG
          </span>
          <input
            value={d.title}
            onChange={(e) => updateNodeData(id, { title: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground outline-none focus:border-b focus:border-amber-500"
            disabled={running}
          />
        </CardTitle>
        <Badge variant={statusMeta.variant} className="shrink-0 text-[10px]">
          {statusMeta.label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-2 p-2.5">
        {/* 入边就绪状态面板（替代原内嵌文本框 + 资产槽） */}
        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            入边状态
          </div>
          <InputStatusRow
            ok={inputs.hasStoryboard}
            fallback={!!d.storyboardText?.trim()}
            Icon={FileText}
            label="故事板文本"
          />
          <InputStatusRow
            ok={inputs.hasSystem}
            fallback={!!d.systemPrompt?.trim()}
            Icon={Settings2}
            label="系统提示词"
          />
          <InputStatusRow
            ok={inputs.contentRefs.length > 0}
            Icon={Images}
            label={
              inputs.contentRefs.length > 0
                ? `参考图 × ${inputs.contentRefs.length}`
                : "参考图"
            }
          />
        </div>

        {/* 模型选择 */}
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-[11px] font-medium text-muted-foreground">模型</label>
          <Select
            value={d.model ?? ""}
            onValueChange={(v) => updateNodeData(id, { model: v })}
            disabled={running}
          >
            <SelectTrigger className="h-7 flex-1 text-xs">
              <SelectValue placeholder="默认" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs">默认</SelectItem>
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  <span className="block truncate" title={m}>{m}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 结果指示：生成成功后只显示一行简短状态，图片在独立 image 节点展示 */}
        {d.status === "done" && d.resultImageUrl && (
          <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            <span className="truncate">已生成 → 右侧结果图节点</span>
          </div>
        )}

        {/* 操作按钮 */}
        <Button
          size="sm"
          className="h-8 w-full bg-amber-600 text-xs hover:bg-amber-700"
          disabled={running || !hasStoryboardInput}
          onClick={() => generateSegment(id)}
        >
          {running ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              生成中…
            </>
          ) : hasResult ? (
            <>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              重新生成导演板
            </>
          ) : (
            <>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              生成导演板图
            </>
          )}
        </Button>

        {/* 错误提示 */}
        {d.status === "error" && d.error && (
          <div className="flex items-start gap-1.5 rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="break-all">{d.error}</span>
          </div>
        )}
      </CardContent>

      {/* React Flow Handles：琥珀色，区别于 shot 的橙色 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-amber-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-amber-500"
      />
    </Card>
  );
}

/** 入边状态行：✅ 已连接 / ⚠ 未连接（有 fallback 时显示「内嵌」标签）。 */
function InputStatusRow({
  ok,
  fallback,
  Icon,
  label,
}: {
  ok: boolean;
  fallback?: boolean;
  Icon: typeof FileText;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px]",
        ok ? "text-foreground" : "text-muted-foreground/70",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="flex-1">{label}</span>
      {ok ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      ) : fallback ? (
        <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
          内嵌
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50">未连接</span>
      )}
    </div>
  );
}
