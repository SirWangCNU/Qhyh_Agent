import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, Loader2, AlertCircle, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentOutputView } from "@/components/agent/AgentOutputView";
import { useRunAgentStep } from "@/hooks/use-agents";
import { NODE_ORDER, NODE_META, ROUTES, type NodeKey } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { UserInput } from "@/types/api";

type RunStatus = "idle" | "running" | "done" | "error";

/**
 * Agent 管理页（#/agents）— 独立调试每个 Agent。
 *
 * 布局：左侧 6 张 Agent 卡片网格 + 右侧详情面板（元信息 + 表单 + 运行 + 输出）。
 *
 * 与分步工坊的区别：
 * - 工坊会累计 state 串联 5 个 Agent；
 * - 本页每次只单独运行一个 Agent，state 传空 {}，便于独立调试。
 */
export function AgentsPage() {
  const [activeAgent, setActiveAgent] = useState<NodeKey>("planner");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [output, setOutput] = useState<unknown>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
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
  const meta = NODE_META[activeAgent];

  function validateForm(): string | null {
    if (!form.product_name.trim()) return "请填写产品名称";
    if (!form.origin.trim()) return "请填写产地";
    if (!form.category.trim()) return "请填写品类";
    if (!form.selling_points.trim()) return "请填写卖点";
    return null;
  }

  async function handleRun() {
    const err = validateForm();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setStatus("running");
    setErrorMsg("");
    setOutput(null);
    try {
      const resp = await runStep.mutateAsync({
        step: activeAgent,
        input: form,
        state: {}, // 独立调试：不累计 state
      });
      if (resp.status === "error") {
        throw new Error(resp.error ?? `${activeAgent} 执行失败`);
      }
      setOutput(resp.output);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  function selectAgent(key: NodeKey) {
    setActiveAgent(key);
    setStatus("idle");
    setOutput(null);
    setErrorMsg("");
  }

  return (
    <section className="container-app py-10">
      <div className="module__head">
        <span className="eyebrow">
          <span className="num">06</span>
          Agent 管理
        </span>
        <h2 className="section-title">独立调试每个 Agent</h2>
        <p className="section-desc">
          选择任意 Agent，填入农产品信息，单独运行并查看结构化输出。本页不串联 state，适合单元调试。
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_440px]">
        {/* 左侧：Agent 卡片网格 + 输出 */}
        <div className="space-y-6">
          {/* 卡片网格 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NODE_ORDER.map((key, idx) => {
              const m = NODE_META[key];
              const isActive = activeAgent === key;
              return (
                <motion.button
                  key={key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  type="button"
                  onClick={() => selectAgent(key)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "group flex flex-col gap-2 rounded-lg border p-4 text-left transition-all",
                    "hover:scale-[1.02] active:scale-[0.99]",
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-xl">
                      {m.emoji}
                    </span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div>
                    <div className="font-display text-sm font-semibold text-ink">
                      {m.label} Agent
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                      {m.kicker}
                    </div>
                  </div>
                  <p className="text-xs text-ink-soft">{m.desc}</p>
                  {isActive && (
                    <Badge variant="default" className="mt-1 w-fit text-[10px]">
                      已选中
                    </Badge>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* 输出渲染区 */}
          <motion.div
            key={activeAgent}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-border bg-card p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">
                {meta.emoji} {meta.label} Agent 输出
              </h3>
              {status === "done" && (
                <Badge variant="success">
                  <Check size={12} className="mr-1" />
                  运行成功
                </Badge>
              )}
              {status === "error" && <Badge variant="destructive">失败</Badge>}
              {status === "running" && (
                <Badge variant="default">
                  <Loader2 size={12} className="mr-1 animate-spin" />
                  执行中
                </Badge>
              )}
            </div>

            {status === "running" && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}

            {status === "done" && output != null ? (
              <AgentOutputView step={activeAgent} output={output} />
            ) : null}

            {status === "error" && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle size={14} className="mr-1 inline" />
                {errorMsg}
              </div>
            )}

            {(status === "idle" || (!output && status !== "running" && status !== "error")) && (
              <p className="py-8 text-center text-sm text-ink-faint">
                填写右侧表单后点击「运行 Agent」查看输出
              </p>
            )}
          </motion.div>
        </div>

        {/* 右侧：详情面板 + 表单 */}
        <aside className="space-y-4">
          {/* 详情面板 */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary text-2xl">
                {meta.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  {meta.kicker}
                </div>
                <h3 className="font-display text-lg font-semibold text-ink">
                  {meta.label} Agent
                </h3>
                <p className="mt-1 text-xs text-ink-soft">{meta.desc}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                步骤 {String(NODE_ORDER.indexOf(activeAgent) + 1).padStart(2, "0")}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                独立调试模式
              </Badge>
            </div>
            <Link to={ROUTES.workshop}>
              <Button variant="outline" size="sm" className="mt-3 w-full">
                <ExternalLink size={14} />
                在分步工坊中打开
              </Button>
            </Link>
          </div>

          {/* 表单 */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-3 font-display text-base font-semibold text-ink">农产品信息</h3>
            <div className="space-y-3">
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
              <div>
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
              <div>
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

            {errorMsg && status !== "error" && (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertCircle size={12} className="mr-1 inline" />
                {errorMsg}
              </div>
            )}

            <Button
              onClick={() => void handleRun()}
              disabled={status === "running"}
              className="mt-4 w-full"
            >
              {status === "running" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  运行中
                </>
              ) : (
                <>
                  <Play size={16} />
                  运行 {meta.label} Agent
                </>
              )}
            </Button>
          </div>
        </aside>
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
