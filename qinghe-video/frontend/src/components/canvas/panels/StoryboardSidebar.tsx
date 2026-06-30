/**
 * 故事板侧边栏：素材库 + 旁白同步 + 批量操作 + 时间轴导航。
 *
 * 仅在画布 mode === "storyboard" 时由 CanvasPage 渲染（替代 NodeInspector 或并存）。
 *
 * - 素材库：人物/物品/场景参考图缩略图，可拖拽到 ShotNode（设置 referenceImageUrl）。
 * - 旁白：显示整体旁白，可一键同步到所有 shot 的 narration。
 * - 批量操作：批量生成分镜图 / 一键合成视频。
 * - 时间轴：底部水平缩略图条，点击定位到对应 ShotNode。
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCanvasStore, type StoryboardAssets } from "@/stores/canvas-store";
import { useCanvasStoryboard } from "@/components/canvas/hooks/useCanvasStoryboard";
import type { ShotNodeData } from "@/components/canvas/types";
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
  character: { icon: User, color: "#3b82f6", label: "人物" },
  object: { icon: Package, color: "#f59e0b", label: "物品" },
  scene: { icon: MapPin, color: "#10b981", label: "场景" },
};

export function StoryboardSidebar({ onComposeComplete }: StoryboardSidebarProps) {
  const assets = useCanvasStore((s) => s.storyboardAssets);
  const voiceover = useCanvasStore((s) => s.storyboardVoiceover);
  const setStoryboardVoiceover = useCanvasStore((s) => s.setStoryboardVoiceover);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setSelected = useCanvasStore((s) => s.setSelected);

  const { generateAllShots, composeStoryboard, isGeneratePending, isComposePending } =
    useCanvasStoryboard();
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const shotNodes = nodes.filter(
    (n): n is typeof n & { data: ShotNodeData } =>
      (n.data as { kind?: string }).kind === "shot",
  );
  const doneCount = shotNodes.filter(
    (n) => (n.data as ShotNodeData).status === "done",
  ).length;
  const pendingCount = shotNodes.filter((n) => {
    const st = (n.data as ShotNodeData).status;
    return st === "idle" || st === "error";
  }).length;

  /** 把参考图 URL 应用到当前选中的 ShotNode。 */
  function applyReferenceToSelected(url: string, type: keyof StoryboardAssets) {
    if (!selectedNodeId) return;
    const selected = nodes.find((n) => n.id === selectedNodeId);
    if (!selected || (selected.data as { kind?: string }).kind !== "shot") return;
    updateNodeData(selectedNodeId, {
      referenceImageUrl: url,
      referenceType: type,
    } as Partial<ShotNodeData>);
  }

  /** 把整体旁白同步到所有 shot 的 narration（按 shot 顺序均分或全量复制）。 */
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
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-card p-3">
      {/* 批量操作 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Film className="h-4 w-4" /> 故事板
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>分镜总数</span>
            <span className="font-medium">{shotNodes.length}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>已完成</span>
            <Badge variant="success" className="text-[10px]">
              {doneCount}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>待生成</span>
            <Badge variant="secondary" className="text-[10px]">
              {pendingCount}
            </Badge>
          </div>
          <Button
            size="sm"
            className="h-8 w-full text-xs"
            disabled={pendingCount === 0 || isGeneratePending}
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
            disabled={doneCount === 0 || composing || isComposePending}
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
        </CardContent>
      </Card>

      {/* 素材库 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <ImageIcon className="h-4 w-4" /> 素材库
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            选中一个分镜节点后，点击素材应用为该分镜的参考图。
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
                    className="flex items-center gap-2 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground"
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
                    "flex w-full items-center gap-2 rounded-md border p-1.5 text-left transition-colors",
                    "hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                  title={`应用为「${meta.label}」参考图`}
                >
                  <img
                    src={asset.url}
                    alt={meta.label}
                    className="h-12 w-12 shrink-0 rounded border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      <Icon
                        className="h-3 w-3"
                        style={{ color: meta.color }}
                      />
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

      {/* 旁白 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Volume2 className="h-4 w-4" /> 整体旁白
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={voiceover}
            onChange={(e) => setStoryboardVoiceover(e.target.value)}
            placeholder="整体旁白文本（用于视频合成 TTS）…"
            className="h-24 resize-none text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full text-xs"
            onClick={syncVoiceoverToShots}
            disabled={!voiceover.trim() || shotNodes.length === 0}
          >
            同步到所有分镜
          </Button>
        </CardContent>
      </Card>

      {/* 时间轴导航（缩略图条） */}
      {shotNodes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">分镜导航</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
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
                      <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-blue-500" />
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
    </aside>
  );
}
