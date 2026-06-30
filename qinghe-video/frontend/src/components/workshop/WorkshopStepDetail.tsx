import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentOutputView } from "@/components/agent/AgentOutputView";
import { ConsistencyImagesPanel } from "@/components/workshop/ConsistencyImagesPanel";
import { WORKSHOP_STEPS, type WorkshopStepKey, type NodeKey } from "@/lib/constants";
import type { WorkshopStepStatus } from "@/stores/workshop-store";

interface WorkshopStepContentProps {
  step: WorkshopStepKey;
  status: WorkshopStepStatus;
  output: unknown;
  errorMsg?: string;
}

/**
 * 工坊步骤内联内容渲染器（无外壳卡片，供 WorkshopStepCard 嵌入使用）。
 * - LLM 步骤 → 复用 <AgentOutputView>
 * - consistency_images → 一致性生图面板
 */
export function WorkshopStepContent({
  step,
  status,
  output,
  errorMsg,
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

  return (
    <div className="min-h-[80px]">
      {errorMsg && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle size={12} className="mr-1 inline" />
          {errorMsg}
        </div>
      )}

      {status === "running" && <DetailSkeleton />}
      {status === "done" && <DetailContent step={step} output={output} />}
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
}: {
  step: WorkshopStepKey;
  output: unknown;
}) {
  // LLM 步骤：复用 AgentOutputView
  const llmSteps: NodeKey[] = ["planner", "copywriter", "scriptwriter", "report_generator"];
  if (llmSteps.includes(step as NodeKey)) {
    return <AgentOutputView step={step as NodeKey} output={output} />;
  }

  return null;
}
