/**
 * 故事板侧边栏。
 *
 * 仅在画布 mode === "storyboard" 时由 CanvasPage 渲染（替代 NodeInspector）。
 * 重新组织为四个分区（自上而下）：
 *   1. 系统提示词区  —— 段级导演板默认系统提示词（可折叠）
 *   2. 素材库区      —— 人物 / 物品 / 场景参考图，点击应用到选中节点
 *   3. 段级操作区    —— 批量生成段级导演板图 + 段缩略图导航（主推流程）
 *   4. shot 级操作区  —— 细粒度单镜 + 视频合成（弱化，标「可选 · 细粒度」）
 */
import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Film,
  ImageIcon,
  User,
  Package,
  MapPin,
  Volume2,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Settings2,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCanvasStore, type StoryboardAssets } from "@/stores/canvas-store";
import { useCanvasStoryboard } from "@/components/canvas/hooks/useCanvasStoryboard";
import type { SegmentNodeData, ShotNodeData } from "@/components/canvas/types";
import { cn } from "@/lib/utils";

interface StoryboardSidebarProps {
  /** 合成视频成功后的回调（由 CanvasPage 用于展示视频播放器）。 */
  onComposeComplete?: (videoUrl: string) => void;
}

/** 资产类型 → 图标与颜色。 */
const ASSET_META: Record<
  keyof StoryboardAssets,
  { icon: typeof User; color: string; label: string }
> = {
  character: { icon: User, color: "#e8a33d", label: "人物" },
  object: { icon: Package, color: "#e8a33d", label: "物品" },
  scene: { icon: MapPin, color: "#e8a33d", label: "场景" },
};

export function StoryboardSidebar({ onComposeComplete }: StoryboardSidebarProps) {
  const assets = useCanvasStore((s) => s.storyboardAssets);
  const voiceover = useCanvasStore((s) => s.storyboardVoiceover);
  const setStoryboardVoiceover = useCanvasStore((s) => s.setStoryboardVoiceover);
  const systemPrompt = useCanvasStore((s) => s.systemPrompt);
  const setSystemPrompt = useCanvasStore((s) => s.setSystemPrompt);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelected = useCanvasStore((s) => s.setSelected);

  const {
    generateAllShots,
    generateAllSegments,
    composeStoryboard,
    isGeneratePending,
    isComposePending,
  } = useCanvasStoryboard();
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // 折叠态：系统提示词默认展开，素材库默认展开
  const [showSystemPrompt, setShowSystemPrompt] = useState(true);

  const segmentNodes = nodes.filter(
    (n): n is typeof n & { data: SegmentNodeData } =>
      (n.data as { kind?: string }).kind === "segment",
  );
  const shotNodes = nodes.filter(
    (n): n is typeof n & { data: ShotNodeData } =>
      (n.data as { kind?: string }).kind === "shot",
  );

  // 段级统计
  const segDone = segmentNodes.filter(
    (n) => (n.data as SegmentNodeData).status === "done",
  ).length;
  const segPending = segmentNodes.filter((n) => {
    const st = (n.data as SegmentNodeData).status;
    return st === "idle" || st === "error";
  }).length;

  // shot 级统计
  const shotDone = shotNodes.filter(
    (n) => (n.data as ShotNodeData).status === "done",
  ).length;
  const shotPending = shotNodes.filter((n) => {
    const st = (n.data as ShotNodeData).status;
    return st === "idle" || st === "error";
  }).length;

  /** 把参考图 URL 应用到当前选中的节点（segment 或 shot 均支持）。 */
  function applyReferenceToSelected(url: string, type: keyof StoryboardAssets) {
    if (!selectedNodeId) return;
    const selected = nodes.find((n) => n.id === selectedNodeId);
    if (!selected) return;
    const kind = (selected.data as { kind?: string }).kind;
    if (kind === "shot") {
      updateNodeData(selectedNodeId, {
        referenceImageUrl: url,
        referenceType: type,
      } as Partial<ShotNodeData>);
    }
    // segment 节点不直接绑定参考图（段级生成走 store.storyboardAssets），仅高亮提示
  }

  /** 把整体旁白同步到所有 shot 的 narration。 */
  function syncVoiceoverToShots() {
    if (!voiceover.trim()) return;
    shotNodes.forEach((n) => {
      updateNodeData(n.id, { narration: voiceover } as Partial<ShotNodeData>);
    });
  }

  async function handleCompose() {
    setComposing(true);
    setComposeError(null);
    try {
      const result = await composeStoryboard();
      if (result.videoUrl) {
        onComposeComplete?.(result.videoUrl);
      } else {
        setComposeError(result.error ?? "合成失败");
      }
    } finally {
      setComposing(false);
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-card/60 p-3">
      {/* —— 1. 系统提示词区 —— */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Settings2 className="h-4 w-4 text-[hsl(var(--primary))]" />
            系统提示词
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSystemPrompt((v) => !v)}
            className="flex w-full items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {showSystemPrompt ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            段级导演板默认提示词
            <span className="ml-auto text-[10px] text-muted-foreground/70">
              {systemPrompt.trim() ? "已自定义" : "默认"}
            </span>
          </button>
          {showSystemPrompt && (
            <>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="留空段会回退到此默认 STORYBOARD_BOARD_PROMPT…"
                className="max-h-40 resize-y font-mono text-[11px] leading-relaxed"
              />
              <p className="text-[10px] text-muted-foreground">
                单段可在节点内单独覆盖。
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* —— 2. 素材库区 —— */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ImageIcon className="h-4 w-4 text-[hsl(var(--primary))]" />
            素材库
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            选中分镜节点后，点击素材应用为参考图。
          </p>
          {(Object.keys(ASSET_META) as Array<keyof StoryboardAssets>).map(
            (type) => {
              const asset = assets[type];
              const meta = ASSET_META[type];
              const Icon = meta.icon;
              if (!asset) {
                return (
                  <div
                    key={type}
                    className="flex items-center gap-2 rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground"
                  >
                    <Icon className="h-4 w-4" style={{ color: meta.color }} />
                    <span>{meta.label}：无</span>
                  </div>
                );
              }
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => applyReferenceToSelected(asset.url, type)}
                  disabled={!selectedNodeId}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border border-border p-1.5 text-left transition-colors",
                    "hover:border-primary hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  title={`应用为「${meta.label}」参考图`}
                >
                  <img
                    src={asset.url}
                    alt={meta.label}
                    className="h-12 w-12 shrink-0 rounded border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      <Icon className="h-3 w-3" style={{ color: meta.color }} />
                      {meta.label}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      点击应用
                    </div>
                  </div>
                </button>
              );
            },
          )}
        </CardContent>
      </Card>

      {/* —— 3. 段级操作区（主推流程）—— */}
      {segmentNodes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Clapperboard className="h-4 w-4 text-[hsl(var(--primary))]" />
              片段级导演板
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>片段总数</span>
              <span className="font-medium text-foreground">
                {segmentNodes.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>已完成</span>
              <Badge variant="success" className="text-[10px]">
                {segDone}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>待生成</span>
              <Badge variant="secondary" className="text-[10px]">
                {segPending}
              </Badge>
            </div>
            <Button
              size="sm"
              className="h-8 w-full bg-amber-600 text-xs hover:bg-amber-700"
              disabled={segPending === 0 || isGeneratePending}
              onClick={() => generateAllSegments()}
            >
              {isGeneratePending ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  批量生成中…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  批量生成导演板图
                </>
              )}
            </Button>

            {/* 段缩略图导航 */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 pt-1">
              {segmentNodes.map((n) => {
                const d = n.data as SegmentNodeData;
                const isSelected = n.id === selectedNodeId;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelected(n.id)}
                    title={d.title}
                    className={cn(
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded border-2 transition-all",
                      isSelected
                        ? "border-primary ring-1 ring-primary"
                        : "border-transparent hover:border-muted",
                    )}
                  >
                    {d.resultImageUrl ? (
                      <img
                        src={d.resultImageUrl}
                        alt={d.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                        {d.title.slice(0, 4)}
                      </div>
                    )}
                    {d.status === "done" && (
                      <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                    {d.status === "running" && (
                      <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-500" />
                    )}
                    {d.status === "error" && (
                      <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-destructive" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* —— 4. shot 级操作区（保留但弱化，细粒度可选）—— */}
      <Card className="opacity-80">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Layers className="h-4 w-4" />
            可选 · 细粒度（shot 级）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>分镜总数</span>
            <span className="font-medium text-foreground">
              {shotNodes.length}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>已完成</span>
            <Badge variant="success" className="text-[10px]">
              {shotDone}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>待生成</span>
            <Badge variant="secondary" className="text-[10px]">
              {shotPending}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full text-xs"
            disabled={shotPending === 0 || isGeneratePending}
            onClick={() => generateAllShots()}
          >
            {isGeneratePending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                批量生成中…
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                批量生成分镜图
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-full text-xs"
            disabled={shotDone === 0 || composing || isComposePending}
            onClick={() => void handleCompose()}
          >
            {composing || isComposePending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                合成视频中…
              </>
            ) : (
              <>
                <Film className="mr-1 h-3.5 w-3.5" />
                一键合成视频
              </>
            )}
          </Button>
          {composeError && (
            <p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {composeError}
            </p>
          )}

          {/* 整体旁白（shot 级 TTS 用） */}
          <div className="space-y-1 pt-1">
            <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Volume2 className="h-3 w-3" /> 整体旁白
            </label>
            <Textarea
              value={voiceover}
              onChange={(e) => setStoryboardVoiceover(e.target.value)}
              placeholder="整体旁白文本（用于视频合成 TTS）…"
              className="h-20 resize-none text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-[11px]"
              onClick={syncVoiceoverToShots}
              disabled={!voiceover.trim() || shotNodes.length === 0}
            >
              同步到所有分镜
            </Button>
          </div>

          {/* 分镜缩略图导航 */}
          {shotNodes.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 pt-1">
              {shotNodes.map((n) => {
                const d = n.data as ShotNodeData;
                const isSelected = n.id === selectedNodeId;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelected(n.id)}
                    title={d.title}
                    className={cn(
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded border-2 transition-all",
                      isSelected
                        ? "border-primary ring-1 ring-primary"
                        : "border-transparent hover:border-muted",
                    )}
                  >
                    {d.resultImageUrl || d.referenceImageUrl ? (
                      <img
                        src={d.resultImageUrl ?? d.referenceImageUrl}
                        alt={d.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                        {d.title.slice(0, 4)}
                      </div>
                    )}
                    {d.status === "done" && (
                      <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                    {d.status === "running" && (
                      <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-orange-500" />
                    )}
                    {d.status === "error" && (
                      <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-destructive" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}
