/**
 * ReAct 事件流渲染组件。
 *
 * 视觉方向：温暖的"助手信笺"——最终答案像一封手写回信，
 * 思考过程则是页边批注式的时间线，可展开查看细节。
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Search,
  Image as ImageIcon,
  Video,
  Volume2,
  Workflow,
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ChatMessage, ConversationEvent } from "@/types/api";
import type { ReactMeta } from "@/hooks/use-conversation";
import { useTypewriter } from "@/hooks/use-typewriter";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { cn } from "@/lib/utils";

const TOOL_ICONS: Record<string, typeof Search> = {
  web_search: Search,
  run_pipeline: Workflow,
  generate_image: ImageIcon,
  generate_video: Video,
  generate_tts: Volume2,
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "联网搜索",
  run_pipeline: "主流水线",
  generate_image: "生成图片",
  generate_video: "生成视频",
  generate_tts: "语音配音",
};

export function ReActMessage({ msg }: { msg: ChatMessage }) {
  const meta = (msg.meta ?? {
    events: [],
    iterations: 0,
    isRunning: false,
  }) as ReactMeta;
  const { events, iterations, isRunning, error } = meta;
  const answer = msg.content;
  const isError = answer.startsWith("❌") || !!error;

  const flowEvents = events.filter(
    (e) => e.event !== "answer" && e.event !== "done",
  );

  const { displayed: displayedAnswer, done: typingDone, skip } = useTypewriter(
    isError ? "" : answer,
    !isError && isRunning,
    12,
  );

  const renderedAnswer = isError
    ? answer
    : typingDone
      ? answer
      : displayedAnswer || answer.slice(0, 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex justify-start"
    >
      <div className="w-full max-w-[85%] space-y-2.5 sm:max-w-[78%]">
        {/* Agent 头像 + 名称 */}
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm"
            style={{
              background: "linear-gradient(135deg, #3d5a3d 0%, #2d4a2b 100%)",
              boxShadow: "0 0 0 2px #e8d9b0",
            }}
          >
            <Sparkles size={15} className="text-white" />
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-medium text-ink">青禾 Agent</span>
            {iterations > 0 && (
              <span className="text-[11px] text-ink-faint">
                {iterations} 轮迭代 ·{" "}
                {new Date(msg.ts).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>

        {/* ReAct 思考流时间轴 */}
        {flowEvents.length > 0 && (
          <div className="relative space-y-2.5 pl-5">
            <span
              className="absolute left-[7px] top-2 bottom-2 w-px"
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, var(--color-border-strong) 50%, transparent 50%)",
                backgroundSize: "1px 5px",
              }}
              aria-hidden="true"
            />
            {flowEvents.map((ev, idx) => (
              <FlowEventItem key={idx} ev={ev} />
            ))}
            {isRunning && flowEvents.length > 0 && (
              <div className="flex items-center gap-2 py-0.5 text-xs text-ink-faint">
                <Loader2 size={11} className="animate-spin text-accent" />
                <span className="italic">继续思考…</span>
              </div>
            )}
          </div>
        )}

        {/* 进行中但还没有事件 */}
        {isRunning && flowEvents.length === 0 && (
          <div className="flex w-fit items-center gap-3 rounded-2xl border border-border bg-card/80 px-4 py-2.5 text-sm text-ink-soft shadow-sm backdrop-blur-sm">
            <Loader2 size={14} className="animate-spin text-brand" />
            <span>Agent 正在理解你的需求…</span>
          </div>
        )}

        {/* 最终答案卡片 —— 助手信笺 */}
        {!isError && answer && (
          <motion.div
            layout
            className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-4 shadow-sm"
          >
            {/* 左上角装饰弧线 */}
            <span
              className="pointer-events-none absolute -left-3 -top-3 h-16 w-16 rounded-full opacity-20 blur-md"
              style={{ background: "#c9a961" }}
              aria-hidden="true"
            />
            {/* 左侧金色竖线 */}
            <span
              className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-accent"
              aria-hidden="true"
            />
            {/* 顶部淡色装饰线 */}
            <span
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              aria-hidden="true"
            />

            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                <Sparkles size={11} />
                <span>最终方案</span>
              </div>
              {!typingDone && isRunning && (
                <button
                  type="button"
                  onClick={skip}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink-faint transition-colors hover:bg-secondary hover:text-ink"
                >
                  <Zap size={10} />
                  跳过动画
                </button>
              )}
            </div>

            <div className="relative text-[15px] leading-relaxed">
              <MarkdownRenderer source={renderedAnswer} />
              {!typingDone && isRunning && (
                <span
                  className="ml-0.5 inline-block h-4 w-px animate-pulse bg-brand align-middle"
                  aria-hidden="true"
                />
              )}
            </div>
          </motion.div>
        )}

        {/* 错误提示 */}
        {isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 shadow-sm">
            {answer || `❌ ${error}`}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const NODE_DOT_COLOR: Record<string, string> = {
  think: "var(--color-accent)",
  tool_call: "var(--color-brand)",
  tool_result: "var(--color-success)",
};

function FlowEventItem({ ev }: { ev: ConversationEvent }) {
  const dotColor = NODE_DOT_COLOR[ev.event] ?? "var(--color-ink-faint)";
  return (
    <div className="relative">
      <span
        className="absolute -left-5 top-1.5 h-2 w-2 rounded-full ring-2 ring-card"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      {ev.event === "think" && (
        <ThinkBlock
          content={String(ev.data.content ?? "")}
          iteration={Number(ev.data.iteration ?? 0)}
        />
      )}
      {ev.event === "tool_call" && (
        <ToolCallBlock
          name={String(ev.data.name ?? "")}
          args={ev.data.args as Record<string, unknown> | undefined}
          iteration={Number(ev.data.iteration ?? 0)}
        />
      )}
      {ev.event === "tool_result" && (
        <ToolResultBlock
          name={String(ev.data.name ?? "")}
          output={String(ev.data.output ?? "")}
          success={Boolean(ev.data.success)}
        />
      )}
    </div>
  );
}

function ThinkBlock({
  content,
  iteration,
}: {
  content: string;
  iteration: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-secondary/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-soft transition-colors hover:text-ink"
      >
        <Brain size={12} className="shrink-0 text-accent" />
        <span className="font-medium">思考 · 第 {iteration} 轮</span>
        <ChevronDown
          size={12}
          className={cn(
            "ml-auto shrink-0 transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="px-3 pb-3 text-xs leading-relaxed text-ink-faint">
              {content}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolCallBlock({
  name,
  args,
  iteration,
}: {
  name: string;
  args?: Record<string, unknown>;
  iteration: number;
}) {
  const Icon = TOOL_ICONS[name] ?? Wrench;
  const label = TOOL_LABELS[name] ?? name;
  const argsStr = args ? JSON.stringify(args) : "";
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Icon size={11} />
        </span>
        <span className="font-medium text-ink">{label}</span>
        <span className="text-[10px] text-ink-faint">第 {iteration} 轮</span>
      </div>
      {argsStr && (
        <code className="mt-1 block truncate font-mono text-[10px] text-ink-faint">
          {argsStr}
        </code>
      )}
    </div>
  );
}

function ToolResultBlock({
  name,
  output,
  success,
}: {
  name: string;
  output: string;
  success: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] ?? name;
  return (
    <div className="ml-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-xs"
      >
        {success ? (
          <CheckCircle2 size={12} className="shrink-0 text-success" />
        ) : (
          <XCircle size={12} className="shrink-0 text-warn" />
        )}
        <span className="text-ink-soft">{label} 结果</span>
        <ChevronDown
          size={12}
          className={cn("ml-auto transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <pre className="mt-1.5 whitespace-pre-wrap text-[10px] leading-relaxed text-ink-faint">
              {output}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
