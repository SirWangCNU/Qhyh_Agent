import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { WORKSHOP_STEPS } from "@/lib/constants";
import type { WorkshopStepStatus } from "@/stores/workshop-store";
import type { WorkshopStepKey } from "@/lib/constants";

interface WorkshopProgressBarProps {
  steps: Record<WorkshopStepKey, WorkshopStepStatus>;
  isAutoRunning: boolean;
  currentStep: WorkshopStepKey;
}

/**
 * 工坊顶部极简进度条：
 * - 细条 + 步骤节点小圆点
 * - 右侧百分比与状态文字
 */
export function WorkshopProgressBar({
  steps,
  isAutoRunning,
  currentStep,
}: WorkshopProgressBarProps) {
  const total = WORKSHOP_STEPS.length;
  const doneCount = WORKSHOP_STEPS.filter(
    (s) => steps[s.key] === "done",
  ).length;
  const ratio = doneCount / total;
  const percent = Math.round(ratio * 100);

  const curMeta = WORKSHOP_STEPS.find((s) => s.key === currentStep);
  let statusText: string;
  if (isAutoRunning && curMeta) {
    statusText = `自动执行中 · ${curMeta.emoji} ${curMeta.title}`;
  } else if (doneCount === total) {
    statusText = "全部完成";
  } else if (doneCount > 0) {
    statusText = `已完成 ${doneCount}/${total} 步`;
  } else {
    statusText = "等待开始";
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1">
        {/* 步骤节点 */}
        <div className="absolute -top-1 left-0 right-0 flex justify-between">
          {WORKSHOP_STEPS.map((s) => {
            const status = steps[s.key] ?? "pending";
            return (
              <div
                key={s.key}
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full border-2 text-[9px] font-bold",
                  status === "done"
                    ? "border-success bg-success text-success-foreground"
                    : status === "running"
                      ? "border-primary bg-primary text-primary-foreground"
                      : status === "error"
                        ? "border-destructive bg-destructive text-destructive-foreground"
                        : currentStep === s.key
                          ? "border-primary bg-background text-primary"
                          : "border-border bg-background text-ink-faint",
                )}
                title={`${s.num}. ${s.title}`}
              >
                {s.num}
              </div>
            );
          })}
        </div>
        {/* 进度条轨道 */}
        <div
          className="h-1.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className={cn(
              "h-full rounded-full transition-colors",
              percent === 100 ? "bg-success" : "bg-primary",
            )}
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          />
        </div>
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-sm font-medium text-ink">
        {percent}%
      </span>
      <span className="hidden shrink-0 text-xs text-ink-soft sm:inline">
        {statusText}
      </span>
    </div>
  );
}
