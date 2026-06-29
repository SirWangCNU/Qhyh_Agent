import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import type {
  AgentStepRequest,
  AgentStepResponse,
  GenerateResult,
  TopicCandidate,
  UserInput,
} from "@/types/api";
import { NODE_ORDER, type NodeKey } from "@/lib/constants";

/**
 * 单步 Agent 执行 hook（POST /api/agents/{step}）。
 *
 * - 6 个可调用 step：planner / copywriter / scriptwriter / visual_designer / distributor / report_generator
 * - 请求体：{ input: UserInput, state: 累计 GenerateResult, selected_topic?: 用户选定的选题 }
 * - 响应：{ status, step, label, output_key, output, state, error? }
 */
export function useRunAgentStep() {
  return useMutation({
    mutationFn: async ({
      step,
      input,
      state,
      selected_topic,
    }: {
      step: NodeKey;
      input: UserInput;
      state: Partial<GenerateResult>;
      selected_topic?: TopicCandidate | null;
    }) => {
      if (!NODE_ORDER.includes(step)) {
        throw new Error(`未知的 Agent step: ${step}`);
      }
      const body: AgentStepRequest = { input, state, selected_topic: selected_topic ?? undefined };
      return apiPost<AgentStepResponse>(`/api/agents/${step}`, body);
    },
  });
}

/** 把后端返回的相对 URL（如 /outputs/xxx.mp4）补全为完整 URL。 */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const backend = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "");
  return `${backend}${url.startsWith("/") ? "" : "/"}${url}`;
}
