/**
 * 无限画布 zustand 状态管理。
 *
 * 设计要点：
 * - nodes / edges / viewport 不持久化到 sessionStorage（数据量大，统一由服务端 GET 恢复）；
 *   仅持久化 projectId + name，刷新后回到同一项目并从服务端重载。
 * - 所有 mutating action 末尾调 markDirty()，触发 useCanvasAutosave 的 2s 防抖保存。
 * - onNodesChange / onEdgesChange / onConnect 用 React Flow 的 applyNodeChanges /
 *   applyEdgeChanges / addEdge 适配，供 CanvasFlow 直接绑定。
 */
import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import { STORAGE_KEYS } from "@/lib/constants";
import type { CanvasNode, CanvasNodeData } from "@/components/canvas/types";

/** 自动保存状态。 */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** 从服务端载入的完整项目数据结构。 */
export interface LoadedProject {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: Edge[];
  viewport: Viewport;
}

interface CanvasState {
  /** 当前项目 id（null = 未选择/未创建）。 */
  projectId: string | null;
  /** 当前项目名。 */
  name: string;
  /** 画布节点。 */
  nodes: CanvasNode[];
  /** 画布连线。 */
  edges: Edge[];
  /** 画布视口。 */
  viewport: Viewport;
  /** 当前选中节点 id。 */
  selectedNodeId: string | null;
  /** 是否有未保存改动。 */
  dirty: boolean;
  /** 自动保存状态指示。 */
  saveStatus: SaveStatus;
  /** 项目数据是否已从服务端载入（防止重复 loadProject）。 */
  loaded: boolean;

  // ---- 项目级动作 ----
  loadProject: (p: LoadedProject) => void;
  /** 进入一个新创建的空项目。 */
  newProject: (id: string, name: string) => void;
  /** 切换到已有项目（仅记 id 并清空本地态，等待 CanvasPage 拉取后 loadProject）。 */
  switchProject: (id: string) => void;
  setName: (name: string) => void;
  setSelected: (id: string | null) => void;
  markDirty: () => void;
  markSaved: () => void;
  setSaveStatus: (s: SaveStatus) => void;
  /** 退出项目（清空本地态，不删服务端）。 */
  reset: () => void;
  /** 从 sessionStorage 恢复 projectId / name。 */
  hydrate: () => void;

  // ---- 节点/连线动作（React Flow 绑定）----
  setNodes: (updater: CanvasNode[] | ((n: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (updater: Edge[] | ((e: Edge[]) => Edge[])) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (conn: Connection) => void;
  setViewport: (v: Viewport) => void;
  addNode: (node: CanvasNode) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  removeNode: (id: string) => void;
  addEdgeRaw: (edge: Edge) => void;
}

const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/** 持久化 projectId / name 到 sessionStorage。 */
function persistSession(projectId: string | null, name: string) {
  try {
    sessionStorage.setItem(
      STORAGE_KEYS.canvas,
      JSON.stringify({ projectId, name }),
    );
  } catch {
    /* ignore quota / unavailable */
  }
}

/** 读取 sessionStorage 中的 projectId / name。 */
function readSession(): { projectId: string | null; name: string } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.canvas);
    if (!raw) return { projectId: null, name: "" };
    const parsed = JSON.parse(raw) as {
      projectId: string | null;
      name?: string;
    };
    return { projectId: parsed.projectId ?? null, name: parsed.name ?? "" };
  } catch {
    return { projectId: null, name: "" };
  }
}

/** 解析 updater：函数则调用，否则直接返回。 */
function resolve<T>(val: T | ((prev: T) => T), prev: T): T {
  return typeof val === "function" ? (val as (p: T) => T)(prev) : val;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectId: null,
  name: "",
  nodes: [],
  edges: [],
  viewport: INITIAL_VIEWPORT,
  selectedNodeId: null,
  dirty: false,
  saveStatus: "idle",
  loaded: false,

  loadProject: (p) => {
    set({
      projectId: p.id,
      name: p.name,
      nodes: p.nodes,
      edges: p.edges,
      viewport: p.viewport,
      loaded: true,
      dirty: false,
      saveStatus: "idle",
      selectedNodeId: null,
    });
    persistSession(p.id, p.name);
  },

  newProject: (id, name) => {
    set({
      projectId: id,
      name,
      nodes: [],
      edges: [],
      viewport: INITIAL_VIEWPORT,
      loaded: true,
      dirty: false,
      saveStatus: "idle",
      selectedNodeId: null,
    });
    persistSession(id, name);
  },

  switchProject: (id) => {
    // 清空本地态 + 标记未加载，等 CanvasPage 拉取完整数据后 loadProject
    set({
      projectId: id,
      name: "",
      nodes: [],
      edges: [],
      viewport: INITIAL_VIEWPORT,
      loaded: false,
      dirty: false,
      saveStatus: "idle",
      selectedNodeId: null,
    });
    persistSession(id, "");
  },

  setName: (name) => {
    set({ name, dirty: true, saveStatus: "idle" });
    persistSession(get().projectId, name);
  },

  setSelected: (id) => set({ selectedNodeId: id }),

  markDirty: () => set({ dirty: true, saveStatus: "idle" }),

  markSaved: () => set({ dirty: false, saveStatus: "saved" }),

  setSaveStatus: (s) => set({ saveStatus: s }),

  reset: () => {
    set({
      projectId: null,
      name: "",
      nodes: [],
      edges: [],
      viewport: INITIAL_VIEWPORT,
      selectedNodeId: null,
      dirty: false,
      saveStatus: "idle",
      loaded: false,
    });
    persistSession(null, "");
  },

  hydrate: () => {
    const { projectId, name } = readSession();
    if (projectId) {
      set({ projectId, name });
    }
  },

  setNodes: (updater) =>
    set((s) => ({ nodes: resolve(updater, s.nodes), dirty: true, saveStatus: "idle" })),

  setEdges: (updater) =>
    set((s) => ({ edges: resolve(updater, s.edges), dirty: true, saveStatus: "idle" })),

  onNodesChange: (changes: NodeChange[]) =>
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes) as CanvasNode[],
      dirty: true,
      saveStatus: "idle",
    })),

  onEdgesChange: (changes: EdgeChange[]) =>
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: true,
      saveStatus: "idle",
    })),

  onConnect: (conn: Connection) =>
    set((s) => ({
      edges: addEdge({ ...conn, animated: true }, s.edges),
      dirty: true,
      saveStatus: "idle",
    })),

  setViewport: (v) => set({ viewport: v, dirty: true, saveStatus: "idle" }),

  addNode: (node) =>
    set((s) => ({
      nodes: [...s.nodes, node],
      selectedNodeId: node.id,
      dirty: true,
      saveStatus: "idle",
    })),

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, ...patch } as CanvasNodeData }
          : n,
      ),
      dirty: true,
      saveStatus: "idle",
    })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      dirty: true,
      saveStatus: "idle",
    })),

  addEdgeRaw: (edge) =>
    set((s) => ({ edges: [...s.edges, edge], dirty: true, saveStatus: "idle" })),
}));

/** 类型导出供组件使用（避免重复 import）。 */
export type { Node, Edge };
