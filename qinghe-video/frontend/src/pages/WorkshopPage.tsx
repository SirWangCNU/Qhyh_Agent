import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Loader2, Check, AlertCircle, Image as ImageIcon, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentOutputView } from "@/components/agent/AgentOutputView";
import { useRunAgentStep, resolveMediaUrl } from "@/hooks/use-agents";
import { useGenerateImage, useVideoMvp } from "@/hooks/use-media";
import { NODE_ORDER, NODE_META, type NodeKey } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { GenerateResult, UserInput } from "@/types/api";

type StepStatus = "idle" | "running" | "done" | "error";

const WORKSHOP_STEPS = NODE_ORDER.filter((s) => s !== "report_generator") as Exclude<
  NodeKey,
  "report_generator"
>[];

/**
 * 分步 Agent 工坊（#/workshop）。
 *
 * 布局：左侧 6 步 rail + 右侧 stage（表单 + 当前步骤输出 + 素材生成区）。
 */
export function WorkshopPage() {
  const [activeStep, setActiveStep] = useState<NodeKey>("planner");
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({});
  const [stepOutputs, setStepOutputs] = useState<Record<string, unknown>>({});
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [workshopState, setWorkshopState] = useState<GenerateResult>({});
  const [form, setForm] = useState<UserInput>({
    product_name: "",
    origin: "",
    category: "",
    selling_points: "",
    target_platform: "抖音",
    target_duration: "30-60秒",
    additional_info: "",
  });

  const runStep = useRunAgentStep();
  const generateImage = useGenerateImage();
  const videoMvp = useVideoMvp();

  const [generatedImages, setGeneratedImages] = useState<
    Array<{ url: string; prompt: string; status: "loading" | "done" | "error" }>
  >([]);
  const [videoResult, setVideoResult] = useState<{
    url: string;
    audioUrl?: string;
    imageCount?: number;
  } | null>(null);

  const meta = NODE_META[activeStep];

  function validateForm(): string | null {
    if (!form.product_name.trim()) return "请填写产品名称";
    if (!form.origin.trim()) return "请填写产地";
    if (!form.category.trim()) return "请填写品类";
    if (!form.selling_points.trim()) return "请填写卖点";
    return null;
  }

  async function handleRunStep() {
    const validationError = validateForm();
    if (validationError) {
      setStepErrors((s) => ({ ...s, [activeStep]: validationError }));
      return;
    }
    setStepStatus((s) => ({ ...s, [activeStep]: "running" }));
    setStepErrors((s) => ({ ...s, [activeStep]: "" }));
    try {
      const resp = await runStep.mutateAsync({
        step: activeStep as NodeKey,
        input: form,
        state: workshopState,
      });
      if (resp.status === "error") {
        throw new Error(resp.error ?? `${activeStep} 执行失败`);
      }
      setStepOutputs((s) => ({ ...s, [activeStep]: resp.output }));
      setWorkshopState(resp.state);
      setStepStatus((s) => ({ ...s, [activeStep]: "done" }));
    } catch (err) {
      setStepStatus((s) => ({ ...s, [activeStep]: "error" }));
      setStepErrors((s) => ({
        ...s,
        [activeStep]: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  async function handleGenerateImages() {
    const shotPrompts = workshopState.visual_output?.shot_prompts ?? [];
    if (shotPrompts.length === 0) {
      alert("请先执行视觉 Agent 生成 shot_prompts");
      return;
    }
    const prompts = shotPrompts.slice(0, 4);
    setGeneratedImages(prompts.map((p) => ({ url: "", prompt: p.prompt, status: "loading" })));

    await Promise.all(
      prompts.map(async (p, idx) => {
        try {
          const resp = await generateImage.mutateAsync({
            prompt: p.prompt,
            negative_prompt: p.negative_prompt,
            size: "1920x1920",
            n: 1,
          });
          const url = resp.images[0]?.url ?? "";
          setGeneratedImages((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, url, status: "done" } : it)),
          );
        } catch {
          setGeneratedImages((prev) =>
            prev.map((it, i) => (i === idx ? { ...it, status: "error" } : it)),
          );
        }
      }),
    );
  }

  async function handleComposeVideo() {
    if (!workshopState.visual_output?.shot_prompts?.length) {
      alert("请先生成视觉分镜");
      return;
    }
    try {
      const resp = await videoMvp.mutateAsync({ state: workshopState });
      setVideoResult({
        url: resp.video_url,
        audioUrl: resp.audio_url,
        imageCount: resp.image_count,
      });
    } catch (err) {
      alert(`视频合成失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <section className="container-app py-10">
      <div className="module__head">
        <span className="eyebrow">
          <span className="num">04</span>
          分步 Agent 工坊
        </span>
        <h2 className="section-title">把创作拆成六道农事工序</h2>
        <p className="section-desc">
          不再一次性黑盒生成。每一步都可以单独执行、检查产物，再进入下一道工序。
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* 左侧 step rail */}
        <aside aria-label="步骤列表">
          <div className="flex flex-col gap-1.5">
            {WORKSHOP_STEPS.map((key, idx) => {
              const m = NODE_META[key];
              const status = stepStatus[key] ?? "idle";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveStep(key)}
                  aria-current={activeStep === key ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-all",
                    "hover:scale-[1.01] active:scale-[0.99]",
                    activeStep === key
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-base">
                    {m.emoji}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {m.label}
                      <span className="font-mono text-[10px] text-ink-faint">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                      {m.kicker}
                    </span>
                  </span>
                  <StepStatusIcon status={status} />
                </button>
              );
            })}
          </div>
        </aside>

        {/* 右侧 stage */}
        <div className="space-y-6">
          {/* 产品信息表单 */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-3 font-display text-base font-semibold text-ink">产品信息</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormInput
                label="产品名称"
                required
                value={form.product_name}
                onChange={(v) => setForm((f) => ({ ...f, product_name: v }))}
                placeholder="如：阳山水蜜桃"
              />
              <FormInput
                label="产地"
                required
                value={form.origin}
                onChange={(v) => setForm((f) => ({ ...f, origin: v }))}
                placeholder="如：江苏无锡"
              />
              <FormInput
                label="品类"
                required
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                placeholder="如：水果 / 蔬菜 / 茶叶"
              />
              <FormInput
                label="目标平台"
                value={form.target_platform ?? "抖音"}
                onChange={(v) => setForm((f) => ({ ...f, target_platform: v }))}
                placeholder="抖音 / 快手 / 视频号"
              />
              <FormInput
                label="目标时长"
                value={form.target_duration ?? "30-60秒"}
                onChange={(v) => setForm((f) => ({ ...f, target_duration: v }))}
                placeholder="15-30秒 / 30-60秒"
              />
              <div className="sm:col-span-2">
                <Label htmlFor="selling_points">
                  卖点 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="selling_points"
                  value={form.selling_points}
                  onChange={(e) => setForm((f) => ({ ...f, selling_points: e.target.value }))}
                  placeholder="用一句话描述核心卖点"
                  className="mt-1"
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="additional_info">补充信息（可选）</Label>
                <Textarea
                  id="additional_info"
                  value={form.additional_info ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, additional_info: e.target.value }))}
                  placeholder="如：预算有限、希望突出产地溯源"
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* 当前步骤 stage */}
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <span className="eyebrow">
                  <span className="num">{String(WORKSHOP_STEPS.indexOf(activeStep as never) + 1).padStart(2, "0")}</span>
                  {meta.kicker}
                </span>
                <h3 className="mt-1 font-display text-lg font-semibold text-ink">
                  {meta.label} Agent
                </h3>
                <p className="text-xs text-ink-soft">{meta.desc}</p>
              </div>
              <Button
                onClick={() => void handleRunStep()}
                disabled={stepStatus[activeStep] === "running"}
              >
                {stepStatus[activeStep] === "running" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> 执行中
                  </>
                ) : (
                  <>
                    <Play size={16} /> 执行当前步骤
                  </>
                )}
              </Button>
            </div>

            {/* 步骤状态徽章 */}
            {stepStatus[activeStep] && (
              <div className="mb-3">
                <StepStatusBadge status={stepStatus[activeStep]} />
              </div>
            )}

            {/* 错误信息 */}
            {stepErrors[activeStep] && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle size={14} className="mr-1 inline" />
                {stepErrors[activeStep]}
              </div>
            )}

            {/* 步骤输出 */}
            <div className="min-h-[120px] rounded-md border border-border bg-background/50 p-3">
              {stepStatus[activeStep] === "running" && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {stepStatus[activeStep] === "done" && stepOutputs[activeStep] != null ? (
                <AgentOutputView step={activeStep} output={stepOutputs[activeStep]} />
              ) : null}
              {(!stepStatus[activeStep] || stepStatus[activeStep] === "idle") && (
                <p className="py-8 text-center text-sm text-ink-faint">
                  点击「执行当前步骤」开始生成
                </p>
              )}
            </div>
          </motion.div>

          {/* 素材生成区（仅当 visual_designer 完成时显示） */}
          {workshopState.visual_output?.shot_prompts?.length ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <span className="eyebrow">
                    <span className="num">07</span>
                    素材生成展示
                  </span>
                  <h3 className="mt-1 font-display text-base font-semibold text-ink">
                    图片与视频素材
                  </h3>
                  <p className="text-xs text-ink-soft">
                    基于视觉 Agent 的 shot_prompts 生成图片素材，然后一键合成视频。
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void handleGenerateImages()}>
                    <ImageIcon size={16} />
                    生成图片
                  </Button>
                  <Button onClick={() => void handleComposeVideo()}>
                    <Film size={16} />
                    一键成片
                  </Button>
                </div>
              </div>

              {/* 图片画廊 */}
              {generatedImages.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {generatedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square overflow-hidden rounded-md border border-border bg-secondary/30"
                    >
                      {img.status === "loading" && <Skeleton className="h-full w-full" />}
                      {img.status === "done" && img.url && (
                        <img
                          src={resolveMediaUrl(img.url) ?? img.url}
                          alt={img.prompt}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                      {img.status === "error" && (
                        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-destructive">
                          生成失败
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 视频结果 */}
              {videoResult && (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-medium text-ink">合成视频</h4>
                  <video
                    src={resolveMediaUrl(videoResult.url) ?? undefined}
                    controls
                    className="w-full rounded-md"
                    style={{ maxHeight: 400 }}
                  />
                  {videoResult.imageCount && (
                    <p className="mt-1 text-xs text-ink-faint">
                      使用 {videoResult.imageCount} 张分镜图
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
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
      <Label>
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

function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <Loader2 size={14} className="animate-spin text-primary" />;
  if (status === "done") return <Check size={14} className="text-success" />;
  if (status === "error") return <AlertCircle size={14} className="text-destructive" />;
  return null;
}

function StepStatusBadge({ status }: { status: StepStatus }) {
  const map = {
    idle: { variant: "outline" as const, label: "等待中" },
    running: { variant: "default" as const, label: "执行中" },
    done: { variant: "success" as const, label: "已完成" },
    error: { variant: "destructive" as const, label: "失败" },
  };
  const cur = map[status];
  return <Badge variant={cur.variant}>{cur.label}</Badge>;
}
