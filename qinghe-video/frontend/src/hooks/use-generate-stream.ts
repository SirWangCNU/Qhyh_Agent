import { useCallback, useRef, useState } from "react";
import { getAuthToken } from "@/lib/api";
import { parseSSEStream } from "@/lib/sse";
import { usePipelineStore } from "@/stores/pipeline-store";
import type { GenerateResult, SSEEvent, UserInput } from "@/types/api";
import { NODE_ORDER, type NodeKey } from "@/lib/constants";

interface UseGenerateStreamReturn {
  /** 是否正在生成。 */
  isGenerating: boolean;
  /** 错误信息（来自 SSE error 事件或网络异常）。 */
  error: string | null;
  /** 触发流式生成。resolve 在 SSE complete 事件后。 */
  generate: (input: UserInput) => Promise<GenerateResult | null>;
  /** 主动中断（关闭 reader）。 */
  abort: () => void;
}

/**
 * SSE 流式生成 hook。
 *
 * 与后端 POST /api/generate/stream 对接，事件顺序：
 *   start → (node_start → node_update)* → complete | error
 *
 * 副作用：把进度写入 pipeline-store，从而驱动 Sidebar 中的进度展示。
 */
export function useGenerateStream(): UseGenerateStreamReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortCtrl = useRef<AbortController | null>(null);

  const store = usePipelineStore;

  const generate = useCallback(async (input: UserInput) => {
    setIsGenerating(true);
    setError(null);
    store.getState().reset();

    abortCtrl.current = new AbortController();
    const token = getAuthToken();

    try {
      const resp = await fetch("/api/generate/stream", {
        method: "POST",
        signal: abortCtrl.current.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`流式生成失败：HTTP ${resp.status}${t ? ` - ${t}` : ""}`);
      }

      let finalResult: GenerateResult | null = null;

      await parseSSEStream(resp, (event, data) => {
        const e = { event, data } as SSEEvent;
        switch (e.event) {
          case "start": {
            store.getState().startTask(e.data.task_id);
            store.getState().setProgress(0, "流水线已启动");
            break;
          }
          case "node_start": {
            const key = e.data.node as NodeKey;
            store.getState().setNodeState(key, "active");
            const idx = NODE_ORDER.indexOf(key);
            const ratio = idx / NODE_ORDER.length;
            store.getState().setProgress(ratio, `正在执行：${key}`);
            store.getState().setStatus(`正在执行：<strong>${key}</strong> Agent`, "info");
            break;
          }
          case "node_update": {
            const key = e.data.node as NodeKey;
            store.getState().setNodeState(key, "done");
            break;
          }
          case "error": {
            const node = (e.data.node ?? null) as NodeKey | null;
            store.getState().setError(node, e.data.error);
            setError(e.data.error);
            break;
          }
          case "complete": {
            finalResult = e.data.result;
            store.getState().setComplete(e.data.task_id, e.data.result);
            break;
          }
        }
      });

      return finalResult;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("请求已中断");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        store.getState().setStatus(`请求失败：<strong>${msg}</strong>`, "error");
      }
      return null;
    } finally {
      setIsGenerating(false);
      abortCtrl.current = null;
    }
  }, [store]);

  const abort = useCallback(() => {
    abortCtrl.current?.abort();
  }, []);

  return { isGenerating, error, generate, abort };
}
