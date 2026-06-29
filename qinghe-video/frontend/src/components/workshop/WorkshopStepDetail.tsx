import { AlertCircle, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AgentOutputView } from "@/components/agent/AgentOutputView";
import { ConsistencyImagesPanel } from "@/components/workshop/ConsistencyImagesPanel";
import { resolveMediaUrl } from "@/hooks/use-agents";
import { WORKSHOP_STEPS, type WorkshopStepKey, type NodeKey } from "@/lib/constants";
import { useWorkshopStore } from "@/stores/workshop-store";
import type { WorkshopMediaResults, WorkshopStepStatus } from "@/stores/workshop-store";

interface WorkshopStepContentProps {
  step: WorkshopStepKey;
  status: WorkshopStepStatus;
  output: unknown;
  errorMsg?: string;
  mediaResults: WorkshopMediaResults;
}

/**
 * 工坊步骤内联内容渲染器（无外壳卡片，供 WorkshopStepCard 嵌入使用）。
 * - LLM 步骤 → 复用 <AgentOutputView>
 * - image_gen → 图片画廊
 * - tts → 音频播放器
 * - compose → 视频播放器
 */
export function WorkshopStepContent({
  step,
  status,
  output,
  errorMsg,
  mediaResults,
}: WorkshopStepContentProps) {
  const cfg = WORKSHOP_STEPS.find((s) => s.key === step);
  if (!cfg) return null;

  // 一致性生图步骤：面板始终可见，用户在子卡片中独立生成
  if (step === "consistency_images") {
    return (
      <div className="min-h-[80px]">
        {errorMsg && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertCircle size={12} className="mr-1 inline" />
            {errorMsg}
          </div>
        )}
        <ConsistencyImagesPanel />
      </div>
    );
  }

  // 出图步骤：顶部始终显示人物参考图开关（B1 联动），下方走原 status 分支
  if (step === "image_gen") {
    return (
      <div className="min-h-[80px]">
        {errorMsg && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertCircle size={12} className="mr-1 inline" />
            {errorMsg}
          </div>
        )}
        <ImageGenRefToggle />
        {status === "running" && <DetailSkeleton />}
        {status === "done" && (
          <DetailContent step={step} output={output} mediaResults={mediaResults} />
        )}
        {(status === "pending" || status === "error") && !errorMsg && (
          <p className="py-4 text-center text-xs text-ink-faint">
            {status === "error" ? "步骤执行失败，可点击重试" : "等待执行"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[80px]">
      {errorMsg && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle size={12} className="mr-1 inline" />
          {errorMsg}
        </div>
      )}

      {status === "running" && <DetailSkeleton />}
      {status === "done" && <DetailContent step={step} output={output} mediaResults={mediaResults} />}
      {(status === "pending" || status === "error") && !errorMsg && (
        <p className="py-4 text-center text-xs text-ink-faint">
          {status === "error" ? "步骤执行失败，可点击重试" : "等待执行"}
        </p>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function DetailContent({
  step,
  output,
  mediaResults,
}: {
  step: WorkshopStepKey;
  output: unknown;
  mediaResults: WorkshopMediaResults;
}) {
  // LLM 步骤：复用 AgentOutputView
  const llmSteps: NodeKey[] = [
    "planner",
    "copywriter",
    "scriptwriter",
    "visual_designer",
    "distributor",
    "report_generator",
  ];
  if (llmSteps.includes(step as NodeKey)) {
    return <AgentOutputView step={step as NodeKey} output={output} />;
  }

  // 出图：图片画廊
  if (step === "image_gen") {
    if (mediaResults.images.length === 0) {
      return <p className="py-4 text-center text-sm text-ink-faint">暂无图片</p>;
    }
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {mediaResults.images.map((img, idx) => (
          <div
            key={idx}
            className="relative aspect-square overflow-hidden rounded-md border border-border bg-secondary/30"
          >
            {img.status === "done" && img.url && (
              <img
                src={resolveMediaUrl(img.url) ?? img.url}
                alt={img.prompt}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            )}
            {img.status === "loading" && <Skeleton className="h-full w-full" />}
            {img.status === "error" && (
              <div className="flex h-full items-center justify-center p-2 text-center text-xs text-destructive">
                生成失败
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 配音：音频播放器
  if (step === "tts") {
    if (!mediaResults.audioUrl) {
      return <p className="py-4 text-center text-sm text-ink-faint">暂无音频</p>;
    }
    return (
      <div className="space-y-2">
        <audio
          src={resolveMediaUrl(mediaResults.audioUrl) ?? undefined}
          controls
          className="w-full"
        />
      </div>
    );
  }

  // 合成：视频播放器
  if (step === "compose") {
    if (!mediaResults.videoUrl) {
      return <p className="py-4 text-center text-sm text-ink-faint">暂无视频</p>;
    }
    const videoUrl = resolveMediaUrl(mediaResults.videoUrl);
    return (
      <div className="space-y-2">
        <video
          src={videoUrl ?? undefined}
          controls
          className="w-full rounded-md"
          style={{ maxHeight: 360 }}
        />
        {videoUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={videoUrl} download>
              <Download size={14} /> 下载视频
            </a>
          </Button>
        )}
      </div>
    );
  }

  return null;
}

/**
 * 出图步骤「使用人物参考图（图生图）」开关。
 * 读取/写入 store.imageGenUseCharacterRef；未生成人物一致性图时禁用并提示。
 */
function ImageGenRefToggle() {
  const checked = useWorkshopStore((s) => s.imageGenUseCharacterRef);
  const setChecked = useWorkshopStore((s) => s.setImageGenUseCharacterRef);
  const hasCharacterImage = useWorkshopStore(
    (s) => s.mediaResults.characterImage?.status === "done",
  );
  return (
    <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        disabled={!hasCharacterImage}
        className="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
      />
      <span>使用人物参考图（图生图）</span>
      {!hasCharacterImage && (
        <span className="text-ink-faint">— 请先在第 3 步生成人物一致性图</span>
      )}
    </label>
  );
}
