import { create } from "zustand";
import type {
  ConsistencyImageSlot,
  ConsistencyImageType,
  GenerateResult,
  TopicCandidate,
  UserInput,
  WorkshopSessionState,
} from "@/types/api";
import {
  WORKSHOP_STEPS,
  DEFAULT_AUTO_RUN_TO,
  type WorkshopStepKey,
  STORAGE_KEYS,
} from "@/lib/constants";
import type { SaveStatus } from "@/stores/canvas-store";

/**
 * 工坊 4 步流水线状态管理。
 *
 * 设计要点（对齐 canvas-store 模式）：
 * - 运行时状态快照持久化到 sessionStorage["qinghe_workshop_state"]，刷新可恢复当前会话。
 * - 会话指针（sessionId + name）持久化到 sessionStorage["qinghe_workshop_session"]，
 *   完整 state 由后端 /api/workshop/sessions 负责，支持多会话切换与跨设备恢复。
 * - 所有 mutating action 末尾调 markDirty()（合并进 set），触发 useWorkshopAutosave 的 2s 防抖保存。
 *
 * 独立于 pipeline-store（后者绑定 SSE 流式生成，仅 6 个 LLM 节点）。
 */

export type WorkshopStepStatus = "pending" | "running" | "done" | "error";

export interface WorkshopMediaResults {
  /** 一致性生图（第 3 步）三类结果，独立存储便于子卡片单独更新。 */
  characterImage: ConsistencyImageSlot | null;
  objectImage: ConsistencyImageSlot | null;
  sceneImage: ConsistencyImageSlot | null;
}

interface WorkshopState {
  /** 每个步骤的执行状态。 */
  steps: Record<WorkshopStepKey, WorkshopStepStatus>;
  /** 每步的输出数据（LLM Agent 输出或媒体结果摘要）。 */
  stepOutputs: Record<string, unknown>;
  /** 每步的错误信息。 */
  stepErrors: Record<string, string>;

  /** LLM Agent 累积的全局状态。 */
  workshopState: GenerateResult;

  /** 媒体生成结果。 */
  mediaResults: WorkshopMediaResults;

  /** 自动执行到第几步（1~4）。 */
  autoRunToStep: number;
  /** 当前查看/执行的步骤。 */
  currentStep: WorkshopStepKey;
  /** 是否正在自动执行中。 */
  isAutoRunning: boolean;
  /** 是否有步骤正在执行。 */
  isStepRunning: boolean;

  /** 产品信息表单。 */
  form: UserInput;

  /** 一句话创意（Step1 极简输入）。 */
  oneLiner: string;

  /** AI 选题候选列表。 */
  topics: TopicCandidate[];
  /** 用户选定的候选索引。 */
  selectedTopicIndex: number | null;
  /** 用户选定的完整选题对象。 */
  selectedTopic: TopicCandidate | null;

  // ---- 会话持久化（对齐 canvas-store）----
  /** 当前工坊会话 id（null = 未关联后端会话）。 */
  sessionId: string | null;
  /** 当前会话名（侧边栏显示用）。 */
  sessionName: string;
  /** 是否有未保存改动。 */
  dirty: boolean;
  /** 自动保存状态指示。 */
  saveStatus: SaveStatus;

  // ---- 动作 ----
  setStepStatus: (key: WorkshopStepKey, status: WorkshopStepStatus) => void;
  setStepOutput: (key: WorkshopStepKey, output: unknown) => void;
  setStepError: (key: WorkshopStepKey, error: string) => void;
  clearStepError: (key: WorkshopStepKey) => void;
  setWorkshopState: (state: GenerateResult) => void;
  setMediaResults: (results: Partial<WorkshopMediaResults>) => void;
  /** 单独更新某一类一致性图（character/object/scene），避免浅合并覆盖其他类。 */
  setConsistencyImage: (type: ConsistencyImageType, slot: ConsistencyImageSlot | null) => void;
  /** 把某类一致性主体描述写入 workshopState.consistency_references，供画布故事板注入。 */
  setConsistencyReferences: (type: ConsistencyImageType, subject: string) => void;
  setAutoRunToStep: (step: number) => void;
  setCurrentStep: (key: WorkshopStepKey) => void;
  setAutoRunning: (running: boolean) => void;
  setStepRunning: (running: boolean) => void;
  setForm: (form: UserInput) => void;
  setOneLiner: (v: string) => void;
  setTopics: (topics: TopicCandidate[]) => void;
  setSelectedTopicIndex: (i: number | null) => void;
  setSelectedTopic: (topic: TopicCandidate | null) => void;
  reset: () => void;
  hydrate: () => void;

  // ---- 会话动作 ----
  /** 从后端载入完整会话（覆盖当前 store，设置 sessionId，写指针）。 */
  loadSession: (session: { id: string; name: string; state: WorkshopSessionState }) => void;
  /** 仅设置 sessionId（新建会话后回填）。 */
  setSessionId: (id: string | null, name?: string) => void;
  /** 清除会话关联（不删后端数据）。 */
  clearSession: () => void;
  markDirty: () => void;
  markSaved: () => void;
  setSaveStatus: (s: SaveStatus) => void;
  /** 构造当前状态快照（供 persist 与 autosave 共用）。 */
  buildSnapshot: () => WorkshopSessionState;
}

/** 构造初始步骤状态（全部 pending）。 */
function initialSteps(): Record<WorkshopStepKey, WorkshopStepStatus> {
  return WORKSHOP_STEPS.reduce(
    (acc, s) => {
      acc[s.key] = "pending";
      return acc;
    },
    {} as Record<WorkshopStepKey, WorkshopStepStatus>,
  );
}

const DEFAULT_FORM: UserInput = {
  product_name: "",
  origin: "",
  category: "",
  selling_points: "",
  target_platform: "抖音",
  target_duration: "30-60秒",
  additional_info: "",
};

const DEFAULT_MEDIA: WorkshopMediaResults = {
  characterImage: null,
  objectImage: null,
  sceneImage: null,
};

const DEFAULT_STATE = {
  steps: initialSteps(),
  stepOutputs: {} as Record<string, unknown>,
  stepErrors: {} as Record<string, string>,
  workshopState: {} as GenerateResult,
  mediaResults: { ...DEFAULT_MEDIA },
  autoRunToStep: DEFAULT_AUTO_RUN_TO,
  currentStep: "planner" as WorkshopStepKey,
  isAutoRunning: false,
  isStepRunning: false,
  form: { ...DEFAULT_FORM },
  oneLiner: "",
  topics: [],
  selectedTopicIndex: null,
  selectedTopic: null,
  sessionId: null as string | null,
  sessionName: "",
  dirty: false,
  saveStatus: "idle" as SaveStatus,
};

/** 构造当前状态快照（workshop-store persist 的 snapshot，对齐后端 state_json schema）。 */
function buildSnapshotFrom(state: WorkshopState): WorkshopSessionState {
  return {
    steps: state.steps,
    stepOutputs: state.stepOutputs,
    stepErrors: state.stepErrors,
    workshopState: state.workshopState,
    mediaResults: state.mediaResults,
    autoRunToStep: state.autoRunToStep,
    currentStep: state.currentStep,
    form: state.form,
    oneLiner: state.oneLiner,
    topics: state.topics,
    selectedTopicIndex: state.selectedTopicIndex,
    selectedTopic: state.selectedTopic,
  };
}

/** 持久化运行时状态快照到 sessionStorage["qinghe_workshop_state"]。 */
function persist(state: WorkshopState) {
  try {
    const snapshot = buildSnapshotFrom(state);
    sessionStorage.setItem(STORAGE_KEYS.workshop, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

/** 持久化会话指针（sessionId + name）到 sessionStorage["qinghe_workshop_session"]。 */
function persistSessionPointer(sessionId: string | null, name: string) {
  try {
    sessionStorage.setItem(
      STORAGE_KEYS.workshopSession,
      JSON.stringify({ sessionId, name }),
    );
  } catch {
    /* ignore quota / unavailable */
  }
}

/** 读取 sessionStorage 中的会话指针。 */
function readSessionPointer(): { sessionId: string | null; name: string } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.workshopSession);
    if (!raw) return { sessionId: null, name: "" };
    const parsed = JSON.parse(raw) as {
      sessionId: string | null;
      name?: string;
    };
    return { sessionId: parsed.sessionId ?? null, name: parsed.name ?? "" };
  } catch {
    return { sessionId: null, name: "" };
  }
}

export const useWorkshopStore = create<WorkshopState>((set, get) => ({
  ...DEFAULT_STATE,

  setStepStatus: (key, status) => {
    set((s) => ({
      steps: { ...s.steps, [key]: status },
      dirty: true,
      saveStatus: "idle",
    }));
    persist(get());
  },

  setStepOutput: (key, output) => {
    set((s) => ({
      stepOutputs: { ...s.stepOutputs, [key]: output },
      dirty: true,
      saveStatus: "idle",
    }));
    persist(get());
  },

  setStepError: (key, error) => {
    set((s) => ({
      stepErrors: { ...s.stepErrors, [key]: error },
      steps: { ...s.steps, [key]: "error" },
      dirty: true,
      saveStatus: "idle",
    }));
    persist(get());
  },

  clearStepError: (key) => {
    set((s) => {
      const errors = { ...s.stepErrors };
      delete errors[key];
      return { stepErrors: errors, dirty: true, saveStatus: "idle" };
    });
    persist(get());
  },

  setWorkshopState: (wsState) => {
    set({ workshopState: wsState, dirty: true, saveStatus: "idle" });
    persist(get());
  },

  setMediaResults: (results) => {
    set((s) => ({
      mediaResults: { ...s.mediaResults, ...results },
      dirty: true,
      saveStatus: "idle",
    }));
    persist(get());
  },

  setConsistencyImage: (type, slot) => {
    set((s) => {
      const key = type === "character" ? "characterImage" : type === "object" ? "objectImage" : "sceneImage";
      return {
        mediaResults: { ...s.mediaResults, [key]: slot },
        dirty: true,
        saveStatus: "idle",
      };
    });
    persist(get());
  },

  setConsistencyReferences: (type, subject) => {
    set((s) => ({
      workshopState: {
        ...s.workshopState,
        consistency_references: {
          ...(s.workshopState.consistency_references ?? {}),
          [type]: subject,
        },
      },
      dirty: true,
      saveStatus: "idle",
    }));
    persist(get());
  },

  setAutoRunToStep: (step) => {
    set({
      autoRunToStep: Math.max(1, Math.min(WORKSHOP_STEPS.length, step)),
      dirty: true,
      saveStatus: "idle",
    });
    persist(get());
  },

  setCurrentStep: (key) => {
    set({ currentStep: key, dirty: true, saveStatus: "idle" });
    persist(get());
  },

  setAutoRunning: (running) => set({ isAutoRunning: running }),
  setStepRunning: (running) => set({ isStepRunning: running }),

  setForm: (form) => {
    set({ form, dirty: true, saveStatus: "idle" });
    persist(get());
  },

  setOneLiner: (v) => {
    set({ oneLiner: v, dirty: true, saveStatus: "idle" });
    persist(get());
  },

  setTopics: (topics) => {
    set((s) => ({
      topics,
      selectedTopicIndex: null,
      selectedTopic: null,
      workshopState: { ...s.workshopState, selected_topic: undefined },
      dirty: true,
      saveStatus: "idle",
    }));
    persist(get());
  },

  setSelectedTopicIndex: (i) => {
    set((s) => {
      const topic = i !== null && i >= 0 && i < s.topics.length ? s.topics[i] : null;
      return {
        selectedTopicIndex: i,
        selectedTopic: topic,
        workshopState: { ...s.workshopState, selected_topic: topic ?? undefined },
        dirty: true,
        saveStatus: "idle",
      };
    });
    persist(get());
  },

  setSelectedTopic: (topic) => {
    set((s) => ({
      selectedTopic: topic,
      workshopState: { ...s.workshopState, selected_topic: topic ?? undefined },
      dirty: true,
      saveStatus: "idle",
    }));
    persist(get());
  },

  // ---- 会话动作 ----

  loadSession: (session) => {
    const s = session.state;
    set({
      sessionId: session.id,
      sessionName: session.name,
      steps: { ...initialSteps(), ...(s.steps ?? {}) },
      stepOutputs: s.stepOutputs ?? {},
      stepErrors: s.stepErrors ?? {},
      workshopState: s.workshopState ?? {},
      mediaResults: { ...DEFAULT_MEDIA, ...(s.mediaResults ?? {}) },
      autoRunToStep: s.autoRunToStep ?? DEFAULT_AUTO_RUN_TO,
      currentStep: (s.currentStep ?? "planner") as WorkshopStepKey,
      form: { ...DEFAULT_FORM, ...(s.form ?? {}) },
      oneLiner: s.oneLiner ?? "",
      topics: s.topics ?? [],
      selectedTopicIndex: s.selectedTopicIndex ?? null,
      selectedTopic: s.selectedTopic ?? null,
      isAutoRunning: false,
      isStepRunning: false,
      dirty: false,
      saveStatus: "idle",
    });
    persist(get());
    persistSessionPointer(session.id, session.name);
  },

  setSessionId: (id, name) => {
    const nextName = name ?? get().sessionName;
    set({ sessionId: id, sessionName: nextName });
    persistSessionPointer(id, nextName);
  },

  clearSession: () => {
    set({ sessionId: null, sessionName: "", dirty: false, saveStatus: "idle" });
    persistSessionPointer(null, "");
  },

  markDirty: () => set({ dirty: true, saveStatus: "idle" }),

  markSaved: () => set({ dirty: false, saveStatus: "saved" }),

  setSaveStatus: (s) => set({ saveStatus: s }),

  buildSnapshot: () => buildSnapshotFrom(get()),

  reset: () => {
    set({ ...DEFAULT_STATE, steps: initialSteps() });
    try {
      sessionStorage.removeItem(STORAGE_KEYS.workshop);
      sessionStorage.removeItem(STORAGE_KEYS.workshopSession);
    } catch {
      /* ignore */
    }
  },

  hydrate: () => {
    try {
      // 先恢复会话指针
      const { sessionId, name } = readSessionPointer();
      if (sessionId) {
        set({ sessionId, sessionName: name });
      }
      // 再恢复运行时快照
      const raw = sessionStorage.getItem(STORAGE_KEYS.workshop);
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      set({
        steps: { ...initialSteps(), ...(snapshot.steps ?? {}) },
        stepOutputs: snapshot.stepOutputs ?? {},
        stepErrors: snapshot.stepErrors ?? {},
        workshopState: snapshot.workshopState ?? {},
        mediaResults: { ...DEFAULT_MEDIA, ...(snapshot.mediaResults ?? {}) },
        autoRunToStep: snapshot.autoRunToStep ?? DEFAULT_AUTO_RUN_TO,
        currentStep: snapshot.currentStep ?? "planner",
        form: { ...DEFAULT_FORM, ...(snapshot.form ?? {}) },
        oneLiner: snapshot.oneLiner ?? "",
        topics: snapshot.topics ?? [],
        selectedTopicIndex: snapshot.selectedTopicIndex ?? null,
        selectedTopic: snapshot.selectedTopic ?? null,
        isAutoRunning: false,
        isStepRunning: false,
        dirty: false,
        saveStatus: "idle",
      });
    } catch {
      /* ignore */
    }
  },
}));
