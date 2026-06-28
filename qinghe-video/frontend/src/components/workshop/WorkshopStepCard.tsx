import { useState } from "react";
import { Loader2, Check, AlertCircle, RotateCcw, Play, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WorkshopStepConfig, WorkshopStepKey } from "@/lib/constants";
import { useWorkshopStore, type WorkshopStepStatus } from "@/stores/workshop-store";
import { WorkshopStepContent } from "./WorkshopStepDetail";

interface WorkshopStepCardProps {
  cfg: WorkshopStepConfig;
  onToggleAutoRun: (num: number) => void;
  onStepClick: (key: WorkshopStepKey) => void;
  onRun: (key: WorkshopStepKey) => void;
  onRetry: (key: WorkshopStepKey) => void;
  onPolish: () => Promise<void>;
  isPolishing: boolean;
}

/**
 * 工坊步骤卡片：每个 Step 以独立卡片呈现，承载自身内容、状态与操作。
 *
 * - Header：步骤指示器 + 序号/标题/kicker + 状态徽章
 * - Body：输入表单（Step 1）或步骤输出内容
 * - Footer：自动执行复选框 + 单步操作按钮
 */
export function WorkshopStepCard({
  cfg,
  onToggleAutoRun,
  onStepClick,
  onRun,
  onRetry,
  onPolish,
  isPolishing,
}: WorkshopStepCardProps) {
  const store = useWorkshopStore();
  const status = store.steps[cfg.key] ?? "pending";
  const isCurrent = store.currentStep === cfg.key;
  const isChecked = store.autoRunToStep >= cfg.num;
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
            isPolishing={isPolishing}
            onPolish={onPolish}
          />
        ) : (
          <WorkshopStepContent
            step={cfg.key}
            status={status}
            output={output}
            errorMsg={errorMsg}
            mediaResults={store.mediaResults}
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              e.stopPropagation();
              onToggleAutoRun(cfg.num);
            }}
            disabled={isRunning}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
            aria-label={`自动执行到第${cfg.num}步`}
          />
          自动执行到此步
        </label>

        <div className="flex items-center gap-2">
          {!depsSatisfied && status !== "done" && (
            <span className="hidden text-xs text-ink-faint sm:inline">
              需先完成前置步骤
            </span>
          )}

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

/** Step 1 策划卡片内容：创意输入 + AI 润写 + 详情表单 */
function PlannerCardBody({
  isPolishing,
  onPolish,
}: {
  isPolishing: boolean;
  onPolish: () => Promise<void>;
}) {
  const store = useWorkshopStore();
  const [showDetail, setShowDetail] = useState(false);

  async function handlePolish() {
    if (!store.form.product_name.trim()) {
      alert("请先填写产品名称");
      return;
    }
    if (!store.oneLiner.trim()) {
      alert("请填写一句话创意");
      return;
    }
    await onPolish();
    setShowDetail(true);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <Label htmlFor={`planner-product_name`} className="text-xs">
            产品名称 <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`planner-product_name`}
            value={store.form.product_name}
            onChange={(e) => store.setForm({ ...store.form, product_name: e.target.value })}
            placeholder="如：阳山水蜜桃"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={`planner-one_liner`} className="text-xs">
            一句话创意 <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={`planner-one_liner`}
            value={store.oneLiner}
            onChange={(e) => store.setOneLiner(e.target.value)}
            placeholder="如：想拍阳山水蜜桃产地溯源短视频"
            className="mt-1"
            rows={1}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => void handlePolish()}
          disabled={isPolishing}
          size="sm"
        >
          {isPolishing ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 润写中
            </>
          ) : (
            <>
              <Sparkles size={14} /> AI 润写
            </>
          )}
        </Button>

        {store.form.selling_points.trim() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetail((v) => !v)}
          >
            {showDetail ? (
              <>
                <ChevronUp size={14} /> 收起详情
              </>
            ) : (
              <>
                <ChevronDown size={14} /> 查看/编辑详情
              </>
            )}
          </Button>
        )}
      </div>

      {showDetail && store.form.selling_points.trim() && (
        <div className="rounded-md border border-border bg-background/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-ink-soft">AI 已补全以下信息，可直接编辑修正</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handlePolish()}
              disabled={isPolishing}
              className="h-7 px-2 text-xs"
            >
              <Sparkles size={12} /> 重新润写
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput
              label="产地"
              value={store.form.origin}
              onChange={(v) => store.setForm({ ...store.form, origin: v })}
              placeholder="如：江苏无锡"
            />
            <FormInput
              label="品类"
              value={store.form.category}
              onChange={(v) => store.setForm({ ...store.form, category: v })}
              placeholder="如：水果 / 蔬菜 / 茶叶"
            />
            <FormInput
              label="目标平台"
              value={store.form.target_platform ?? "抖音"}
              onChange={(v) => store.setForm({ ...store.form, target_platform: v })}
              placeholder="抖音 / 快手 / 视频号"
            />
            <FormInput
              label="目标时长"
              value={store.form.target_duration ?? "30-60秒"}
              onChange={(v) => store.setForm({ ...store.form, target_duration: v })}
              placeholder="15-30秒 / 30-60秒"
            />
            <div className="sm:col-span-2">
              <Label htmlFor="planner-selling_points" className="text-xs">卖点</Label>
              <Textarea
                id="planner-selling_points"
                value={store.form.selling_points}
                onChange={(e) => store.setForm({ ...store.form, selling_points: e.target.value })}
                placeholder="用一句话描述核心卖点"
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="planner-additional_info" className="text-xs">补充信息</Label>
              <Textarea
                id="planner-additional_info"
                value={store.form.additional_info ?? ""}
                onChange={(e) => store.setForm({ ...store.form, additional_info: e.target.value })}
                placeholder="如：预算有限、希望突出产地溯源"
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormInput({
  label,
  required,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1"
      />
    </div>
  );
}
