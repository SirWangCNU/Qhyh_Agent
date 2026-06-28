import { create } from "zustand";
import type { GenerateResult } from "@/types/api";
import { NODE_ORDER, type NodeKey, STORAGE_KEYS } from "@/lib/constants";

/**
 * 流水线运行时状态。
 *
 * 设计目标：解决旧版 HTML 前端"刷新/路由切换丢失流水线进度"的已知 bug
 * （见 AGENTS.md 中 "Known bug: pipeline state lost on page navigation"）。
 * 状态自动持久化到 sessionStorage，刷新或路由切换后可恢复。
 */

export type NodeState = "idle" | "active" | "done" | "error";

interface PipelineState {
  taskId: string | null;
  /** 每个节点的当前状态。 */
  nodes: Record<NodeKey, NodeState>;
  /** 当前正在执行的节点。 */
  activeNode: NodeKey | null;
  /** 出错的节点。 */
  errorNode: NodeKey | null;
  errorMsg: string | null;
  /** 0~1 的整体进度。 */
  progress: number;
  /** 状态行文本（支持 HTML 子串，前端用 dangerouslySetInnerHTML 渲染）。 */
  statusText: string;
  statusType: "idle" | "success" | "error" | "info";
  finalResult: GenerateResult | null;

  // 动作
  startTask: (taskId: string) => void;
  setNodeState: (key: NodeKey, state: NodeState) => void;
  setProgress: (ratio: number, label?: string) => void;
  setStatus: (text: string, type?: PipelineState["statusType"]) => void;
  setError: (node: NodeKey | null, msg: string) => void;
  setComplete: (taskId: string, result: GenerateResult) => void;
  reset: () => void;
  hydrate: () => void;
}

const initialNodes = (): Record<NodeKey, NodeState> =>
  NODE_ORDER.reduce(
    (acc, k) => {
      acc[k] = "idle";
      return acc;
    },
    {} as Record<NodeKey, NodeState>,
  );

const DEFAULT_STATE = {
  taskId: null,
  nodes: initialNodes(),
  activeNode: null,
  errorNode: null,
  errorMsg: null,
  progress: 0,
  statusText: "就绪",
  statusType: "idle" as const,
  finalResult: null,
};

function persist(state: PipelineState) {
  try {
    const snapshot = {
      taskId: state.taskId,
      nodes: state.nodes,
      activeNode: state.activeNode,
      errorNode: state.errorNode,
      errorMsg: state.errorMsg,
      finalResult: state.finalResult,
    };
    sessionStorage.setItem(STORAGE_KEYS.pipeline, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  ...DEFAULT_STATE,

  startTask: (taskId) => {
    set({
      ...DEFAULT_STATE,
      taskId,
      statusText: `Task ID: <strong>${taskId}</strong> · 流水线已启动`,
      statusType: "info",
    });
    persist(get());
  },

  setNodeState: (key, state) => {
    set((s) => {
      const nodes = { ...s.nodes, [key]: state };
      const activeNode = state === "active" ? key : s.activeNode === key ? null : s.activeNode;
      return { nodes, activeNode };
    });
    persist(get());
  },

  setProgress: (ratio, label) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    set((s) => ({
      progress: clamped,
      statusText: label ?? s.statusText,
    }));
  },

  setStatus: (text, type = "info") => {
    set({ statusText: text, statusType: type });
  },

  setError: (node, msg) => {
    set((s) => ({
      errorNode: node,
      errorMsg: msg,
      statusType: "error",
      statusText: node
        ? `节点 <strong>${node}</strong> 执行出错：${msg}`
        : `执行出错：${msg}`,
      nodes: node ? { ...s.nodes, [node]: "error" as NodeState } : s.nodes,
    }));
    persist(get());
  },

  setComplete: (taskId, result) => {
    set((s) => {
      // 完成时把所有非错误节点标记为 done
      const nodes = { ...s.nodes };
      for (const k of NODE_ORDER) {
        if (nodes[k] !== "error") nodes[k] = "done";
      }
      return {
        taskId,
        nodes,
        activeNode: null,
        progress: 1,
        statusText: `✅ 创作方案生成完成 · Task ${taskId}`,
        statusType: "success",
        finalResult: result,
      };
    });
    persist(get());
  },

  reset: () => {
    set({ ...DEFAULT_STATE });
    try {
      sessionStorage.removeItem(STORAGE_KEYS.pipeline);
    } catch {
      /* ignore */
    }
  },

  hydrate: () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.pipeline);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      set({
        taskId: snapshot.taskId ?? null,
        nodes: { ...initialNodes(), ...(snapshot.nodes ?? {}) },
        activeNode: snapshot.activeNode ?? null,
        errorNode: snapshot.errorNode ?? null,
        errorMsg: snapshot.errorMsg ?? null,
        finalResult: snapshot.finalResult ?? null,
      });
    } catch {
      /* ignore */
    }
  },
}));
