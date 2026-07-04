/**
 * 对话创作 Agent hook：对接后端 POST /api/conversation/chat（SSE 流式）。
 *
 * 每次用户发送消息：
 * 1. 追加一条 user 消息（type: "text"）
 * 2. 追加一条 assistant 消息（type: "react"），meta.events 初始为空
 * 3. SSE 事件实时聚合到 assistant 消息的 meta.events 中
 * 4. answer 事件更新 content；done 事件结束运行状态
 *
 * 持久化：
 * - conversationId 由外部传入（ChatPage 管理 URL 参数）
 * - 发送请求时携带 conversation_id，后端在流结束后自动落库
 * - done 事件后 invalidate 列表，侧边栏实时更新
 * - loadHistory() 从后端加载历史消息填充 messages
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BACKEND_URL, STORAGE_KEYS } from "@/lib/constants";
import { parseConversationSSE } from "@/lib/conversation-sse";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type {
  ChatMessage,
  ConversationDetailDTO,
  ConversationEvent,
  ConversationMessage,
} from "@/types/api";

/** react 类型消息的 meta 结构。继承 Record 以兼容 ChatMessage.meta 的类型。 */
export interface ReactMeta extends Record<string, unknown> {
  events: ConversationEvent[];
  iterations: number;
  isRunning: boolean;
  error?: string;
}

/** 生成唯一消息 id。 */
function genId(): string {
  return `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 从消息列表提取对话历史（user text + assistant react answer），供下一轮回传后端。 */
function buildHistory(msgs: ChatMessage[]): ConversationMessage[] {
  return msgs
    .filter((m) => m.type === "text" || m.type === "react")
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));
}

/** 把后端 ConversationDetailDTO.messages 转为前端 ChatMessage[]。 */
function detailToMessages(detail: ConversationDetailDTO): ChatMessage[] {
  return detail.messages.map((m) => {
    const baseMeta = m.meta_json && typeof m.meta_json === "object"
      ? (m.meta_json as Record<string, unknown>)
      : {};
    const meta: Record<string, unknown> = { ...baseMeta, isRunning: false };
    if (m.type === "react") {
      meta.events = Array.isArray(baseMeta.events) ? baseMeta.events : [];
      meta.iterations = typeof baseMeta.iterations === "number" ? baseMeta.iterations : 0;
    }
    return {
      id: m.id,
      role: m.role as "user" | "assistant",
      type: m.type as "text" | "react",
      content: m.content,
      ts: new Date(m.created_at).getTime(),
      meta,
    };
  });
}

export function useConversation() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [conversationId, _setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const loadHistoryReqIdRef = useRef(0);
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const setConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    _setConversationId(id);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** 加载历史会话消息。中止当前SSE流，立即清空旧消息，添加竞态保护。 */
  const loadHistory = useCallback(async (id: string) => {
    abortRef.current?.abort();
    abortRef.current = null;

    const reqId = ++loadHistoryReqIdRef.current;
    setIsRunning(false);
    setMessages([]);
    setConversationId(id);

    try {
      const detail = await apiGet<ConversationDetailDTO>(
        `/api/conversation-sessions/${id}`,
      );
      if (reqId !== loadHistoryReqIdRef.current) return;
      setMessages(detailToMessages(detail));
    } catch {
      if (reqId !== loadHistoryReqIdRef.current) return;
      setMessages([]);
    }
  }, [setConversationId]);

  /** 重置对话（新建会话）：中止SSE，清空消息与 conversationId。 */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    ++loadHistoryReqIdRef.current;
    setMessages([]);
    conversationIdRef.current = null;
    setConversationId(null);
    setIsRunning(false);
  }, [setConversationId]);

  // 登出时重置对话内存状态（清 messages/conversationId）
  // 防止 A 登出后 B 登录看到 A 的对话残留：AuthOverlay 不卸载 Outlet，useState 会保留
  useEffect(() => {
    if (!isAuthenticated) {
      reset();
    }
  }, [isAuthenticated, reset]);

  /** 局部更新某条消息。 */
  const updateMessage = useCallback(
    (id: string, patch: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
    },
    [],
  );

  /** 发送用户消息并启动 ReAct SSE 流。 */
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isRunning) return;

      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        type: "text",
        content: trimmed,
        ts: Date.now(),
      };
      const assistantId = genId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        type: "react",
        content: "",
        ts: Date.now(),
        meta: { events: [], iterations: 0, isRunning: true } as ReactMeta,
      };

      const history = buildHistory(messagesRef.current).concat([
        { role: "user", content: trimmed },
      ]);

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsRunning(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const token = localStorage.getItem(STORAGE_KEYS.token);

      try {
        const resp = await fetch(`${BACKEND_URL}/api/conversation/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            messages: history,
            ...(conversationIdRef.current ? { conversation_id: conversationIdRef.current } : {}),
          }),
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        await parseConversationSSE(resp, (ev) => {
          if (ev.event === "conversation_created") {
            const newConvId = String(ev.data.conversation_id ?? "");
            if (newConvId && !conversationIdRef.current) {
              setConversationId(newConvId);
              qc.invalidateQueries({ queryKey: ["conversations", "list"] });
            }
            return;
          }

          updateMessage(assistantId, (m) => {
            const meta = (m.meta ?? {
              events: [],
              iterations: 0,
              isRunning: true,
            }) as ReactMeta;
            const events = [...meta.events, ev];
            let content = m.content;
            let iterations = meta.iterations;
            let error = meta.error;
            let running = meta.isRunning;

            if (ev.event === "answer") {
              content = String(ev.data.answer ?? "");
            } else if (ev.event === "done") {
              iterations = Number(ev.data.iterations ?? 0);
              running = false;
              const newConvId = ev.data.conversation_id;
              if (typeof newConvId === "string" && newConvId && !conversationIdRef.current) {
                setConversationId(newConvId);
              }
            } else if (ev.event === "error") {
              error = String(ev.data.message ?? "未知错误");
              running = false;
            }

            return {
              ...m,
              content,
              meta: {
                events,
                iterations,
                isRunning: running,
                error,
              } as ReactMeta,
            };
          });
        });

        // 流结束后刷新侧边栏列表（标题/消息数/时间已更新）
        qc.invalidateQueries({ queryKey: ["conversations", "list"] });
        if (conversationIdRef.current) {
          qc.invalidateQueries({
            queryKey: ["conversations", "detail", conversationIdRef.current],
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        updateMessage(assistantId, (m) => ({
          ...m,
          content: `❌ 对话失败：${msg}`,
          meta: {
            ...(m.meta as ReactMeta),
            isRunning: false,
            error: msg,
          },
        }));
      } finally {
        setIsRunning(false);
        abortRef.current = null;
      }
    },
    [isRunning, updateMessage, setConversationId, qc],
  );

  return {
    messages,
    isRunning,
    sendMessage,
    reset,
    conversationId,
    setConversationId,
    loadHistory,
  };
}
