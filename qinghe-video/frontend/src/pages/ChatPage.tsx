/**
 * 对话创作页（#/chat）— ReAct Agent 模式。
 *
 * 视觉方向：温暖自然 · 杂志编辑感
 * - 深橄榄绿为品牌锚点，金色为高光，奶油色与暖米色构成层次。
 * - 空状态像一本摊开的创作手册：大标题、漂浮灵感 pill、宽大的创作输入台。
 * - 对话流以左右气泡呈现，用户消息用橄榄绿渐变，助手答案像带金边的信笺。
 * - 所有文字完整显示，不截断；图片自适应容器，无黑边。
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  RefreshCw,
  ArrowRight,
  MessageSquare,
  Sprout,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useConversation } from "@/hooks/use-conversation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReActMessage } from "@/components/chat/ReActMessage";
import { FeaturedCard, FEATURED_WORKS } from "@/components/chat/FeaturedCard";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/api";

const SUGGESTIONS = [
  "为阳山水蜜桃生成 30 秒抖音视频",
  "为五常大米写一条 60 秒快手口播脚本",
  "为西湖龙井策划一个产地溯源短视频",
  "为赣南脐橙生成适合视频号的投放方案",
  "为云南普洱茶设计一条品牌故事短片",
];

export function ChatPage() {
  const [input, setInput] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const conversation = useConversation();
  const user = useAuthStore((s) => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const urlConvIdRef = useRef<string | null>(null);

  const urlConvId = searchParams.get("conversationId");

  const loadHistory = conversation.loadHistory;
  const reset = conversation.reset;

  useEffect(() => {
    if (urlConvId && urlConvId !== urlConvIdRef.current) {
      urlConvIdRef.current = urlConvId;
      void loadHistory(urlConvId);
    } else if (!urlConvId && urlConvIdRef.current) {
      urlConvIdRef.current = null;
      reset();
    }
  }, [urlConvId, loadHistory, reset]);

  useEffect(() => {
    const seed = searchParams.get("seed");
    if (seed) {
      setInput(seed);
      const next = new URLSearchParams(searchParams);
      next.delete("seed");
      setSearchParams(next, { replace: true });
      textareaRef.current?.focus();
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.messages]);

  useEffect(() => {
    if (!conversation.conversationId) {
      if (urlConvId) {
        const next = new URLSearchParams(searchParams);
        next.delete("conversationId");
        setSearchParams(next, { replace: true });
        urlConvIdRef.current = null;
      }
      return;
    }
    if (urlConvId !== conversation.conversationId) {
      const next = new URLSearchParams(searchParams);
      next.set("conversationId", conversation.conversationId);
      setSearchParams(next, { replace: true });
      urlConvIdRef.current = conversation.conversationId;
    }
  }, [conversation.conversationId, urlConvId, searchParams, setSearchParams]);

  async function ensureConversationAndSend(text: string) {
    await conversation.sendMessage(text);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || conversation.isRunning) return;
    setInput("");
    resetTextareaHeight();
    void ensureConversationAndSend(text);
  }

  function handleSuggestion(text: string) {
    setInput(text);
    textareaRef.current?.focus();
    setTimeout(() => {
      setInput("");
      resetTextareaHeight();
      void ensureConversationAndSend(text);
    }, 0);
  }

  function handleNewConversation() {
    urlConvIdRef.current = null;
    conversation.reset();
    navigate(ROUTES.chat);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function adjustTextareaHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function resetTextareaHeight() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
    }
  }

  const isEmpty = conversation.messages.length === 0;
  const username = user?.username ?? "创作者";

  return (
    <section className="relative flex min-h-[calc(100vh-64px)] flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute -left-20 top-0 h-[36rem] w-[36rem] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(circle, #e8d9b0 0%, transparent 70%)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-0 top-1/3 h-[28rem] w-[28rem] rounded-full opacity-30 blur-[100px]"
        style={{ background: "radial-gradient(circle, #d4e0c8 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="container-app flex min-h-full flex-col">
            <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-12 text-center">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-3xl"
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand shadow-sm backdrop-blur-sm">
                  <Sprout size={12} className="text-accent" />
                  对话创作 · ReAct Agent
                </span>

                <h1 className="mt-7 font-display text-[clamp(2rem,5vw,3.75rem)] font-medium leading-[1.1] tracking-[-0.02em] text-ink">
                  Hi {username}，
                  <br />
                  <span className="text-brand">今天想创作</span>什么农产品短视频？
                </h1>

                <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-ink-soft">
                  像和一位懂农业的创意搭档聊天。Agent 会自主思考、联网搜索、调用流水线，最终给你一套完整方案。
                </p>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.5 }}
                  className="mx-auto mt-10 w-full max-w-2xl px-2"
                >
                  <div className="group relative rounded-3xl border border-border/80 bg-card/90 p-2 shadow-lg backdrop-blur-md transition-all focus-within:border-accent/60 focus-within:shadow-xl focus-within:ring-1 focus-within:ring-accent/30">
                    <div className="absolute inset-x-0 top-0 h-px rounded-t-3xl bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-60" />
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        adjustTextareaHeight(e.target);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="描述你想创作的农产品短视频，例如：为阳山水蜜桃生成 30 秒抖音视频…"
                      rows={1}
                      className="min-h-[56px] resize-none border-0 bg-transparent px-4 py-4 text-sm leading-relaxed text-ink shadow-none ring-0 transition-none placeholder:text-ink-faint/70 focus-visible:ring-0"
                      disabled={conversation.isRunning}
                      aria-label="对话输入"
                    />
                    <div className="flex items-center justify-between px-3 pb-2 pt-1">
                      <span className="text-[11px] text-ink-faint/80">
                        按 Enter 发送，Shift + Enter 换行
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        onClick={handleSend}
                        disabled={!input.trim() || conversation.isRunning}
                        className="h-10 w-10 rounded-full bg-brand text-primary-foreground shadow-sm transition-all hover:bg-brand-deep hover:shadow-md hover:scale-105 active:scale-95 disabled:opacity-50"
                        aria-label="发送消息"
                      >
                        {conversation.isRunning ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <ArrowRight size={18} />
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2 px-2"
                >
                  <span className="text-xs text-ink-faint">灵感：</span>
                  {SUGGESTIONS.map((s, idx) => (
                    <motion.button
                      key={s}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.45 + idx * 0.05, duration: 0.3 }}
                      type="button"
                      onClick={() => void handleSuggestion(s)}
                      disabled={conversation.isRunning}
                      className={cn(
                        "rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs text-ink-soft shadow-sm transition-all hover:border-accent/50 hover:bg-card hover:text-ink hover:shadow",
                        conversation.isRunning && "cursor-not-allowed opacity-50",
                      )}
                    >
                      {s}
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="pb-16 pt-6"
            >
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Featured Works
                  </span>
                  <h3 className="mt-1 font-display text-xl font-medium text-ink">
                    精选创作案例
                  </h3>
                </div>
                <a
                  href="#/create"
                  className="inline-flex items-center gap-1 text-xs text-ink-soft transition-colors hover:text-brand"
                >
                  查看全部
                  <ArrowRight size={12} />
                </a>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {FEATURED_WORKS.map((w, idx) => (
                  <FeaturedCard
                    key={w.title}
                    work={w}
                    index={idx}
                    onClick={handleSuggestion}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="container-app px-4 pb-40 pt-8">
            <div className="mx-auto max-w-3xl space-y-8">
              <AnimatePresence initial={false}>
                {conversation.messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {!isEmpty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="container-app py-4">
            <div className="mx-auto max-w-3xl">
              <div className="relative rounded-2xl border border-border/80 bg-card/95 p-2 shadow-lg transition-all focus-within:border-accent/50 focus-within:shadow-xl focus-within:ring-1 focus-within:ring-accent/20">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    adjustTextareaHeight(e.target);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="继续补充你的想法…"
                  rows={1}
                  className="min-h-[48px] resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-ink shadow-none ring-0 placeholder:text-ink-faint/70 focus-visible:ring-0"
                  disabled={conversation.isRunning}
                  aria-label="对话输入"
                />
                <div className="flex items-center justify-between px-3 pb-1 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-faint/80">
                      Enter 发送 · Shift + Enter 换行
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleNewConversation}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-faint transition-colors hover:bg-secondary hover:text-ink"
                    >
                      <RefreshCw size={11} />
                      新对话
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      onClick={handleSend}
                      disabled={!input.trim() || conversation.isRunning}
                      className="h-9 w-9 rounded-full bg-brand text-primary-foreground shadow-sm transition-all hover:bg-brand-deep hover:scale-105 active:scale-95 disabled:opacity-50"
                      aria-label="发送消息"
                    >
                      {conversation.isRunning ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  if (!isUser) return <ReActMessage msg={msg} />;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex justify-end"
    >
      <div className="flex max-w-[72%] items-start gap-2.5 sm:max-w-[65%]">
        <div
          className="relative overflow-hidden rounded-2xl rounded-tr-sm px-4 py-2.5 text-primary-foreground shadow-md"
          style={{
            background: "linear-gradient(135deg, #3d5a3d 0%, #2d4a2b 100%)",
          }}
        >
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
          <div className="mt-1 text-right text-[10px] opacity-60">
            {new Date(msg.ts).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-ink-soft shadow-sm">
          <MessageSquare size={15} />
        </span>
      </div>
    </motion.div>
  );
}
