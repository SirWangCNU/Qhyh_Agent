import { Loader2, Check, AlertCircle, RotateCcw, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WorkshopStepConfig, WorkshopStepKey } from "@/lib/constants";
import { useWorkshopStore, type WorkshopStepStatus } from "@/stores/workshop-store";
import { WorkshopStepContent } from "./WorkshopStepDetail";
import { TopicCandidateGrid } from "./TopicCandidateGrid";

interface WorkshopStepCardProps {
  cfg: WorkshopStepConfig;
  onStepClick: (key: WorkshopStepKey) => void;
  onRun: (key: WorkshopStepKey) => void;
  onRetry: (key: WorkshopStepKey) => void;
  onStartAutoRun: () => void;
  isApplying: boolean;
  onGenerateTopics: () => Promise<void>;
  onSelectTopic: (index: number) => Promise<void>;
  isGeneratingTopics: boolean;
}

/**
 * 工坊步骤卡片：每个 Step 以独立卡片呈现，承载自身内容、状态与操作。
 *
 * - Header：步骤指示器 + 序号/标题/kicker + 状态徽章
 * - Body：输入表单（Step 1）或步骤输出内容
 * - Footer：前置依赖提示 + 单步操作按钮
 */
export function WorkshopStepCard({
  cfg,
  onStepClick,
  onRun,
  onRetry,
  onStartAutoRun,
  isApplying,
  onGenerateTopics,
  onSelectTopic,
  isGeneratingTopics,
}: WorkshopStepCardProps) {
  const store = useWorkshopStore();
  const status = store.steps[cfg.key] ?? "pending";
  const isCurrent = store.currentStep === cfg.key;
  const output = store.stepOutputs[cfg.key];
  const errorMsg = store.stepErrors[cfg.key];
  const isRunning = store.isStepRunning;

  const depsSatisfied = cfg.deps.every((dep) => store.steps[dep] === "done");
  const canRun = depsSatisfied && !isRunning && (status === "pending" || status === "error");
  const clickable = (isDone(status) || status === "pending" || status === "error") && !isRunning;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-4 transition-all",
        isCurrent
          ? "border-primary/60 bg-primary/[0.02] ring-1 ring-primary/20"
          : "border-border hover:border-primary/30",
        cfg.gridSpan === 2 ? "md:col-span-2" : "md:col-span-1",
        !depsSatisfied && status !== "done" && "opacity-80",
      )}
    >
      {/* 运行中顶部进度条 */}
      {status === "running" && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl bg-secondary">
          <div className="h-full animate-pulse bg-primary" />
        </div>
      )}

      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        <StepIndicator status={status} num={cfg.num} isCurrent={isCurrent} />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => clickable && onStepClick(cfg.key)}
            disabled={!clickable}
            className="w-full text-left disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-semibold text-ink">
                {cfg.title}
              </span>
              <span className="font-mono text-[10px] text-ink-faint">
                {String(cfg.num).padStart(2, "0")}
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {cfg.kicker}
            </div>
            <div className="mt-0.5 text-xs text-ink-soft">
              {cfg.description ?? cfg.desc}
            </div>
          </button>
        </div>

        <StepStatusBadge status={status} />
      </div>

      {/* Body */}
      <div className="flex-1">
        {cfg.key === "planner" ? (
          <PlannerCardBody
            isApplying={isApplying}
            isGeneratingTopics={isGeneratingTopics}
            onGenerateTopics={onGenerateTopics}
            onSelectTopic={onSelectTopic}
            onStartAutoRun={onStartAutoRun}
          />
        ) : (
          <WorkshopStepContent
            step={cfg.key}
            status={status}
            output={output}
            errorMsg={errorMsg}
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <div className="text-xs text-ink-faint">
          {!depsSatisfied && status !== "done" && (
            <span className="hidden sm:inline">需先完成前置步骤</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === "running" && (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <Loader2 size={12} className="animate-spin" /> 执行中
            </span>
          )}

          {status === "error" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onRetry(cfg.key)}
              disabled={isRunning}
            >
              <RotateCcw size={12} /> 重试
            </Button>
          )}

          {status !== "running" && status !== "error" && canRun && cfg.key !== "planner" && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onRun(cfg.key)}
              disabled={isRunning}
            >
              <Play size={12} /> 运行此步
            </Button>
          )}

          {status === "done" && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check size={12} /> 已完成
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** 步骤指示器：radio / check / spinner / error */
function StepIndicator({
  status,
  num,
  isCurrent,
}: {
  status: WorkshopStepStatus;
  num: number;
  isCurrent: boolean;
}) {
  return (
    <div
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition-colors",
        status === "done"
          ? "border-success bg-success text-success-foreground"
          : status === "running"
            ? "border-primary bg-primary text-primary-foreground"
            : status === "error"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : isCurrent
                ? "border-primary bg-background text-primary"
                : "border-border bg-background text-ink-faint",
      )}
    >
      {status === "running" ? (
        <Loader2 size={14} className="animate-spin" />
      ) : status === "done" ? (
        <Check size={14} />
      ) : status === "error" ? (
        <AlertCircle size={14} />
      ) : (
        num
      )}
    </div>
  );
}

/** 步骤状态徽章 */
function StepStatusBadge({ status }: { status: WorkshopStepStatus }) {
  const map = {
    pending: { className: "border-border bg-background text-ink-soft", label: "等待中" },
    running: { className: "border-primary/30 bg-primary/10 text-primary", label: "执行中" },
    done: { className: "border-success/30 bg-success/10 text-success", label: "已完成" },
    error: { className: "border-destructive/30 bg-destructive/10 text-destructive", label: "失败" },
  };
  const cur = map[status];
  return (
    <Badge variant="outline" className={cn("shrink-0 text-[10px]", cur.className)}>
      {cur.label}
    </Badge>
  );
}

function isDone(status: WorkshopStepStatus) {
  return status === "done";
}

/** Step 1 策划卡片内容：产品输入 + AI 选题 */
function PlannerCardBody({
  isGeneratingTopics,
  isApplying,
  onGenerateTopics,
  onSelectTopic,
  onStartAutoRun,
}: {
  isGeneratingTopics: boolean;
  isApplying: boolean;
  onGenerateTopics: () => Promise<void>;
  onSelectTopic: (index: number) => Promise<void>;
  onStartAutoRun: () => void;
}) {
  const store = useWorkshopStore();
  const hasSelectedTopic = store.selectedTopicIndex !== null;

  const handleProductInput = (value: string) => {
    store.setForm({ ...store.form, product_name: value });
    if (!store.oneLiner) {
      store.setOneLiner("为该产品制作一个吸引人的农业短视频");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`planner-product_input`} className="text-xs">
          产品名称 <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id={`planner-product_input`}
          value={store.form.product_name}
          onChange={(e) => handleProductInput(e.target.value)}
          placeholder="请输入您想要制作的产品名称"
          className="mt-1"
          rows={2}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => void onGenerateTopics()}
          disabled={isGeneratingTopics || isApplying || !store.form.product_name.trim()}
          size="sm"
        >
          {isGeneratingTopics ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 选题中
            </>
          ) : isApplying ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 应用中
            </>
          ) : (
            <>
              <Sparkles size={14} /> AI 选题
            </>
          )}
        </Button>
      </div>

      {store.topics.length > 0 && (
        <TopicCandidateGrid
          topics={store.topics}
          selectedIndex={store.selectedTopicIndex}
          disabled={isGeneratingTopics || isApplying}
          onSelect={(i) => {
            void onSelectTopic(i);
          }}
        />
      )}

      {hasSelectedTopic && !isApplying && (
        <div className="rounded-md border border-success/30 bg-success/5 p-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs text-success">
              <Check size={12} />
              AI 已自动补全创作信息（产地、品类、卖点等），可直接开始执行
            </div>
            <Button
              size="sm"
              className="h-8 w-fit text-xs"
              onClick={() => onStartAutoRun()}
              disabled={store.isStepRunning}
            >
              {store.isStepRunning ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> 执行中
                </>
              ) : (
                <>
                  <Play size={12} /> 开始执行
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
