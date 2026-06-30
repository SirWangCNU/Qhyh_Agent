import { Badge } from "@/components/ui/badge";
import { WORKSHOP_STEPS, type WorkshopStepKey } from "@/lib/constants";
import type { WorkshopStepStatus } from "@/stores/workshop-store";
import { WorkshopStepCard } from "./WorkshopStepCard";

interface WorkshopStepListProps {
  steps: Record<WorkshopStepKey, WorkshopStepStatus>;
  currentStep: WorkshopStepKey;
  onStepClick: (key: WorkshopStepKey) => void;
  onRetry: (key: WorkshopStepKey) => void;
  onRun: (key: WorkshopStepKey) => void;
  onStartAutoRun: () => void;
  isApplying: boolean;
  onGenerateTopics: () => Promise<void>;
  onSelectTopic: (index: number) => Promise<void>;
  isGeneratingTopics: boolean;
  disabled: boolean;
}

/**
 * 工坊步骤网格容器：
 * 将 4 个步骤以卡片网格平铺，每个卡片内部承载自身内容与操作。
 *
 * 桌面端布局：
 * - Step 1 | Step 2
 * - Step 3（全宽）
 * - Step 4（全宽）
 */
export function WorkshopStepList({
  onStepClick,
  onRetry,
  onRun,
  onStartAutoRun,
  isApplying,
  onGenerateTopics,
  onSelectTopic,
  isGeneratingTopics,
}: WorkshopStepListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {WORKSHOP_STEPS.map((cfg) => (
        <WorkshopStepCard
          key={cfg.key}
          cfg={cfg}
          onStepClick={onStepClick}
          onRun={onRun}
          onRetry={onRetry}
          onStartAutoRun={onStartAutoRun}
          isApplying={isApplying}
          onGenerateTopics={onGenerateTopics}
          onSelectTopic={onSelectTopic}
          isGeneratingTopics={isGeneratingTopics}
        />
      ))}
    </div>
  );
}

/** 步骤状态徽章（详情面板/卡片内复用） */
export function StepStatusBadge({ status }: { status: WorkshopStepStatus }) {
  const map = {
    pending: { variant: "outline" as const, label: "等待中" },
    running: { variant: "default" as const, label: "执行中" },
    done: { variant: "success" as const, label: "已完成" },
    error: { variant: "destructive" as const, label: "失败" },
  };
  const cur = map[status];
  return <Badge variant={cur.variant}>{cur.label}</Badge>;
}
