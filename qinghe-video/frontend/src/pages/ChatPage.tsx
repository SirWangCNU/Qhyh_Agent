import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Film, RefreshCw, Sparkles, ArrowRight } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useChatPipeline } from "@/hooks/use-chat-pipeline";
import { usePlans } from "@/hooks/use-plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AgentOutputView } from "@/components/agent/AgentOutputView";
import { resolveMediaUrl } from "@/hooks/use-agents";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/api";
import { type NodeKey } from "@/lib/constants";

/** 快捷提示（第二张图顶部 4 个 chip）。 */
const SUGGESTIONS = [
  "为阳山水蜜桃生成 30 秒抖音视频",
  "为五常大米写一条 60 秒快手口播脚本",
  "为西湖龙井策划一个产地溯源短视频",
  "为赣南脐橙生成适合视频号的投放方案",
];

/** 精选作品（第二张图底部 2 列大卡）。 */
const FEATURED_WORKS = [
  {
    title: "安岳柠檬 · 产地溯源",
    desc: "30 秒抖音短视频，突出黄金产区与手工采摘。",
    platform: "抖音",
    duration: "30s",
    prompt:
      "cinematic close-up of fresh yellow lemons on a wooden basket in a sunlit citrus orchard, warm morning light, shallow depth of field, realistic photography, no text",
  },
  {
    title: "五常大米 · 品牌故事",
    desc: "60 秒快手口播脚本，讲述黑土种植到餐桌的旅程。",
    platform: "快手",
    duration: "60s",
    prompt:
      "aerial view of golden rice paddies in Northeast China, a farmer walking through the field with a straw hat, soft sunset light, cinematic realistic photography, no text",
  },
  {
    title: "西湖龙井 · 春茶上市",
    desc: "45 秒视频号产地溯源，展现清明前采茶与炒制。",
    platform: "视频号",
    duration: "45s",
    prompt:
      "close-up of fresh green tea leaves being picked by hand in a misty Longjing tea garden, spring morning dew, realistic photography, no text",
  },
  {
    title: "赣南脐橙 · 果园直发",
    desc: "30 秒抖音带货脚本，强调现摘现发与甜度保证。",
    platform: "抖音",
    duration: "30s",
    prompt:
      "ripe orange fruits hanging on trees in an orchard, farmer carrying a basket, golden hour sunlight, realistic photography, no text",
  },
];

/**
 * 对话创作页（#/chat）— 第二张图效果：
 *
 * 空状态：
 * - 顶部居中「对话创作」小标签
 * - 大标题：Hi {username}, 和青禾一起聊聊创作想法
 * - 4 个快捷提示 chip
 * - 圆角输入框 + 圆形发送按钮
 * - 底部「精选作品」2 列大卡
 *
 * 有消息后：切换到 ChatGPT 风格消息列表，底部保留输入框。
 */
export function ChatPage() {
  const [input, setInput] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const pipeline = useChatPipeline();
  const { getPlan, updatePlan, createPlan } = usePlans();
  const user = useAuthStore((s) => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 从 URL 读取预填提示（来自作品展示卡片点击）
  useEffect(() => {
    const seed = searchParams.get("seed");
    if (seed) {
      setInput(seed);
      searchParams.delete("seed");
      setSearchParams(searchParams, { replace: true });
      inputRef.current?.focus();
    }
  }, [searchParams, setSearchParams]);

  // 从 URL 恢复方案
  useEffect(() => {
    const planId = searchParams.get("planId");
    if (planId) {
      const plan = getPlan(planId);
      pipeline.loadPlan(plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pipeline.messages]);

  // 持久化到 localStorage（每次消息变化）
  useEffect(() => {
    if (pipeline.messages.length === 0) return;
    const planId = searchParams.get("planId");
    if (planId) {
      updatePlan(planId, {
        messages: pipeline.messages,
        state: pipeline.workshopState,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.messages, pipeline.workshopState]);

  function handleSend() {
    const text = input.trim();
    if (!text || pipeline.isRunning) return;

    // 若没有 planId，自动创建一个
    let planId = searchParams.get("planId");
    if (!planId) {
      const plan = createPlan();
      planId = plan.id;
      updatePlan(plan.id, { title: text.slice(0, 30) });
      setSearchParams({ planId }, { replace: true });
    }

    const userInput = pipeline.parseUserInput(text);
    setInput("");
    void pipeline.runPipeline(userInput, text);
  }

  function handleSuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
    // 直接触发发送
    setTimeout(() => {
      const userInput = pipeline.parseUserInput(text);
      setInput("");
      void pipeline.runPipeline(userInput, text);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = pipeline.messages.length === 0;
  const username = user?.username ?? "创作者";

  return (
    <section className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {/* 消息区 / Hero 区 */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="container-app flex min-h-full flex-col">
            {/* Hero：居中 */}
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <span className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                  对话创作
                </span>
                <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink md:text-4xl">
                  Hi {username}，和青禾一起聊聊创作想法
                </h1>
                <p className="mx-auto mt-2 max-w-lg text-sm text-ink-soft">
                  用自然语言描述需求，AI Agent 会依次完成策划、文案、脚本、视觉与投放。
                </p>

                {/* 快捷提示：第二张图 2×2 网格 */}
                <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 px-4 sm:grid-cols-2">
                  {SUGGESTIONS.map((s, idx) => (
                    <motion.button
                      key={s}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + idx * 0.05 }}
                      type="button"
                      onClick={() => void handleSuggestion(s)}
                      disabled={pipeline.isRunning}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-xs text-ink-soft shadow-sm transition-all",
                        "hover:border-primary/40 hover:bg-primary/5 hover:text-ink",
                        "active:scale-95",
                        pipeline.isRunning && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Sparkles size={12} className="shrink-0 text-primary" />
                      <span className="line-clamp-1 text-left">{s}</span>
                    </motion.button>
                  ))}
                </div>

                {/* 输入框 */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="mx-auto mt-8 w-full max-w-2xl px-4"
                >
                  <div className="relative">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="描述你想创作的农产品短视频，例如：为阳山水蜜桃生成 30 秒抖音视频..."
                      className="h-14 rounded-full border-border bg-card pr-14 text-sm shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={pipeline.isRunning}
                      aria-label="对话输入"
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={handleSend}
                      disabled={!input.trim() || pipeline.isRunning}
                      className="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full"
                      aria-label="发送消息"
                    >
                      {pipeline.isRunning ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <ArrowRight size={18} />
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">按 Enter 发送</p>
                </motion.div>
              </motion.div>
            </div>

            {/* 精选作品：底部 2 列大卡 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="pb-8 pt-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  <h3 className="font-display text-base font-semibold text-ink">精选作品</h3>
                </div>
                <a
                  href="#/create"
                  className="inline-flex items-center gap-1 text-xs text-ink-soft transition-colors hover:text-primary"
                >
                  查看全部
                  <ArrowRight size={12} />
                </a>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {FEATURED_WORKS.map((w, idx) => (
                  <FeaturedCard key={w.title} work={w} index={idx} onClick={handleSuggestion} />
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="container-app py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              <AnimatePresence initial={false}>
                {pipeline.messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </AnimatePresence>

              {/* 一键成片按钮 */}
              {pipeline.canCompose && !pipeline.isRunning && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-center pt-2"
                >
                  <Button onClick={() => void pipeline.composeVideo()} disabled={pipeline.isRunning}>
                    <Film size={16} />
                    一键成片
                  </Button>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* 非空状态：底部固定输入框 */}
      {!isEmpty && (
        <div className="border-t border-border bg-background/80 backdrop-blur-sm">
          <div className="container-app py-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-2 rounded-lg border border-border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="继续补充你的想法…"
                  rows={1}
                  className="min-h-[40px] resize-none border-0 bg-transparent focus-visible:ring-0"
                  disabled={pipeline.isRunning}
                  aria-label="对话输入"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || pipeline.isRunning}
                  aria-label="发送消息"
                >
                  {pipeline.isRunning ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </Button>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-ink-faint">
                <span>按 Enter 发送，Shift + Enter 换行</span>
                <button
                  type="button"
                  onClick={() => {
                    pipeline.reset();
                    const planId = searchParams.get("planId");
                    if (planId) {
                      searchParams.delete("planId");
                      setSearchParams(searchParams, { replace: true });
                    }
                  }}
                  className="inline-flex items-center gap-1 hover:text-ink"
                >
                  <RefreshCw size={12} />
                  新对话
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** 精选作品大卡（第二张图底部样式）。 */
function FeaturedCard({
  work,
  index,
  onClick,
}: {
  work: (typeof FEATURED_WORKS)[number];
  index: number;
  onClick: (text: string) => void;
}) {
  const text = `参考「${work.title}」的风格，${work.desc}`;
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.08, duration: 0.45 }}
      whileHover={{ y: -4 }}
      onClick={() => onClick(text)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(text);
        }
      }}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      aria-label={`参考案例：${work.title}（${work.platform} · ${work.duration}）`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted/40">
        <img
          src={`https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(work.prompt)}&image_size=landscape_16_9`}
          alt={work.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const parent = (e.currentTarget as HTMLImageElement).parentElement;
            if (parent) {
              parent.style.background =
                "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)/0.2) 100%)";
            }
          }}
        />
        {/* 底部渐变 + 标题叠加 */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-12">
          <h4 className="font-display text-base font-semibold text-white">{work.title}</h4>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              {work.platform}
            </span>
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              {work.duration}
            </span>
          </div>
        </div>
      </div>
      <p className="p-3 text-xs text-ink-soft line-clamp-2">{work.desc}</p>
    </motion.article>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border text-ink",
        )}
      >
        {msg.type === "loading" && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Loader2 size={14} className="animate-spin" />
            <span>{msg.content}</span>
          </div>
        )}

        {msg.type === "text" && <p className="whitespace-pre-wrap text-sm">{msg.content}</p>}

        {msg.type === "agent" && (
          <div>
            <p className="mb-2 text-sm font-medium">{msg.content}</p>
            {msg.meta?.step != null && msg.meta?.output != null ? (
              <AgentOutputView step={msg.meta.step as NodeKey} output={msg.meta.output} />
            ) : null}
          </div>
        )}

        {msg.type === "video" && (
          <div>
            <p className="mb-2 text-sm font-medium">{msg.content}</p>
            {msg.meta?.video_url ? (
              <video
                src={resolveMediaUrl(msg.meta.video_url as string) ?? undefined}
                controls
                className="mt-2 w-full rounded-md"
                style={{ maxHeight: 400 }}
              />
            ) : null}
            {msg.meta?.audio_url ? (
              <div className="mt-2 text-xs text-ink-faint">
                <a
                  href={resolveMediaUrl(msg.meta.audio_url as string) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary hover:underline"
                >
                  配音音频 →
                </a>
              </div>
            ) : null}
            {msg.meta?.image_count ? (
              <div className="mt-1 text-xs text-ink-faint">
                使用 {String(msg.meta.image_count)} 张分镜图 · 预计时长{" "}
                {String(msg.meta.duration_estimate ?? "—")}
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-1 text-[10px] opacity-60">
          {new Date(msg.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </motion.div>
  );
}
