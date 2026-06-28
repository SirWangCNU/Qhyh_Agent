import { create } from "zustand";
import type { GenerateResult, UserInput } from "@/types/api";
import {
  WORKSHOP_STEPS,
  DEFAULT_AUTO_RUN_TO,
  type WorkshopStepKey,
  STORAGE_KEYS,
} from "@/lib/constants";

/**
 * 工坊 8 步流水线状态管理。
 *
 * 独立于 pipeline-store（后者绑定 SSE 流式生成，仅 6 个 LLM 节点）。
 * 状态自动持久化到 sessionStorage，刷新或路由切换后可恢复。
 */

export type WorkshopStepStatus = "pending" | "running" | "done" | "error";

export interface WorkshopImage {
  url: string;
  prompt: string;
  status: "loading" | "done" | "error";
}

export interface WorkshopMediaResults {
  images: WorkshopImage[];
  audioUrl: string | null;
  audioPath: string | null;
  videoUrl: string | null;
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

  /** 自动执行到第几步（1~8）。 */
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

  // ---- 动作 ----
  setStepStatus: (key: WorkshopStepKey, status: WorkshopStepStatus) => void;
  setStepOutput: (key: WorkshopStepKey, output: unknown) => void;
  setStepError: (key: WorkshopStepKey, error: string) => void;
  clearStepError: (key: WorkshopStepKey) => void;
  setWorkshopState: (state: GenerateResult) => void;
  setMediaResults: (results: Partial<WorkshopMediaResults>) => void;
  setAutoRunToStep: (step: number) => void;
  setCurrentStep: (key: WorkshopStepKey) => void;
  setAutoRunning: (running: boolean) => void;
  setStepRunning: (running: boolean) => void;
  setForm: (form: UserInput) => void;
  setOneLiner: (v: string) => void;
  reset: () => void;
  hydrate: () => void;
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
  images: [],
  audioUrl: null,
  audioPath: null,
  videoUrl: null,
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
};

/** 持久化到 sessionStorage。 */
function persist(state: WorkshopState) {
  try {
    const snapshot = {
      steps: state.steps,
      stepOutputs: state.stepOutputs,
      stepErrors: state.stepErrors,
      workshopState: state.workshopState,
      mediaResults: state.mediaResults,
      autoRunToStep: state.autoRunToStep,
      currentStep: state.currentStep,
      form: state.form,
      oneLiner: state.oneLiner,
    };
    sessionStorage.setItem(STORAGE_KEYS.workshop, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export const useWorkshopStore = create<WorkshopState>((set, get) => ({
  ...DEFAULT_STATE,

  setStepStatus: (key, status) => {
    set((s) => ({
      steps: { ...s.steps, [key]: status },
    }));
    persist(get());
  },

  setStepOutput: (key, output) => {
    set((s) => ({
      stepOutputs: { ...s.stepOutputs, [key]: output },
    }));
    persist(get());
  },

  setStepError: (key, error) => {
    set((s) => ({
      stepErrors: { ...s.stepErrors, [key]: error },
      steps: { ...s.steps, [key]: "error" },
    }));
    persist(get());
  },

  clearStepError: (key) => {
    set((s) => {
      const errors = { ...s.stepErrors };
      delete errors[key];
      return { stepErrors: errors };
    });
    persist(get());
  },

  setWorkshopState: (wsState) => {
    set({ workshopState: wsState });
    persist(get());
  },

  setMediaResults: (results) => {
    set((s) => ({
      mediaResults: { ...s.mediaResults, ...results },
    }));
    persist(get());
  },

  setAutoRunToStep: (step) => {
    set({ autoRunToStep: Math.max(1, Math.min(WORKSHOP_STEPS.length, step)) });
    persist(get());
  },

  setCurrentStep: (key) => {
    set({ currentStep: key });
    persist(get());
  },

  setAutoRunning: (running) => set({ isAutoRunning: running }),
  setStepRunning: (running) => set({ isStepRunning: running }),

  setForm: (form) => {
    set({ form });
    persist(get());
  },

  setOneLiner: (v) => {
    set({ oneLiner: v });
    persist(get());
  },

  reset: () => {
    set({ ...DEFAULT_STATE, steps: initialSteps() });
    try {
      sessionStorage.removeItem(STORAGE_KEYS.workshop);
    } catch {
      /* ignore */
    }
  },

  hydrate: () => {
    try {
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
        isAutoRunning: false,
        isStepRunning: false,
      });
    } catch {
      /* ignore */
    }
  },
}));
