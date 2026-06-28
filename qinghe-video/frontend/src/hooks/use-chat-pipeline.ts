import { useState } from "react";
import { useGenerateStream } from "./use-generate-stream";
import { useRunAgentStep } from "./use-agents";
import { useVideoMvp } from "./use-media";
import type { ChatMessage, GenerateResult, UserInput } from "@/types/api";
import { type NodeKey, NODE_META } from "@/lib/constants";

/**
 * 对话创作核心 hook：
 * - 消息列表 state
 * - 流水线顺序执行（planner→copywriter→scriptwriter→visual_designer→distributor）
 * - 一键成片
 * - 累计 workshopState
 *
 * 简化版实现：与旧版 chat.js runAgentsSequentially 行为对齐，
 * 顺序调用单步 API（不走 SSE），每步追加一条 agent 消息。
 */
export function useChatPipeline() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [workshopState, setWorkshopState] = useState<GenerateResult>({});
  const [lastUserInput, setLastUserInput] = useState<UserInput | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runStep = useRunAgentStep();
  const videoMvp = useVideoMvp();
  const stream = useGenerateStream();

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function genId() {
    return `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /** 重置对话。 */
  function reset() {
    setMessages([]);
    setWorkshopState({});
    setLastUserInput(null);
    setIsRunning(false);
  }

  /** 加载已有方案（从 localStorage）。 */
  function loadPlan(plan: { messages?: ChatMessage[]; state?: GenerateResult } | null) {
    if (!plan) {
      reset();
      return;
    }
    setMessages(plan.messages ?? []);
    setWorkshopState(plan.state ?? {});
  }

  /**
   * 解析用户自然语言为 UserInput。
   * 简化版：把整段文本作为 additional_info，并尝试提取产品名/产地。
   */
  function parseUserInput(text: string): UserInput {
    const input: UserInput = {
      product_name: "",
      origin: "",
      category: "",
      selling_points: text.slice(0, 200),
      target_platform: "抖音",
      target_duration: "30-60秒",
      additional_info: text,
    };
    // 简单正则提取「为 XX 的」或「XX 的」
    const m1 = text.match(/为(.+?)(?:生成|制作|创作|拍)/);
    if (m1) input.product_name = m1[1].trim();
    const m2 = text.match(/([北京天津上海重庆河北山西辽宁吉林黑龙江江苏浙江安徽福建江西山东河南湖北湖南广东海南四川贵州云南陕西甘肃青海台湾内蒙古广西西藏宁夏新疆港澳]+?[省市县区])/);
    if (m2) input.origin = m2[1];
    if (!input.product_name) input.product_name = "农产品";
    return input;
  }

  /**
   * 顺序执行 5 个 Agent（不含 report_generator）。
   * 每步追加 agent 消息，全部完成后追加「一键成片」提示。
   */
  async function runPipeline(userInput: UserInput, userText: string) {
    setLastUserInput(userInput);
    setIsRunning(true);

    // 用户消息
    appendMessage({
      id: genId(),
      role: "user",
      type: "text",
      content: userText,
      ts: Date.now(),
    });

    const steps: NodeKey[] = [
      "planner",
      "copywriter",
      "scriptwriter",
      "visual_designer",
      "distributor",
    ];

    try {
      for (const step of steps) {
        const meta = NODE_META[step];
        const msgId = genId();
        appendMessage({
          id: msgId,
          role: "assistant",
          type: "loading",
          content: `${meta.emoji} 正在执行 ${meta.label} Agent...`,
          ts: Date.now(),
        });

        try {
          const resp = await runStep.mutateAsync({
            step,
            input: userInput,
            state: workshopState,
          });
          if (resp.status === "error") {
            throw new Error(resp.error ?? `${step} 执行失败`);
          }
          // 累计 state
          setWorkshopState(resp.state);
          updateMessage(msgId, {
            type: "agent",
            content: `${meta.emoji} ${meta.label} Agent 已完成`,
            meta: { step, output: resp.output, outputKey: resp.output_key },
          });
        } catch (err) {
          updateMessage(msgId, {
            type: "text",
            content: `❌ ${meta.label} Agent 执行失败：${err instanceof Error ? err.message : String(err)}`,
          });
          break;
        }
      }
    } finally {
      setIsRunning(false);
    }
  }

  /** 一键成片（基于当前 workshopState）。 */
  async function composeVideo() {
    if (!lastUserInput) return;
    setIsRunning(true);
    const msgId = genId();
    appendMessage({
      id: msgId,
      role: "assistant",
      type: "loading",
      content: "🎬 正在合成视频...",
      ts: Date.now(),
    });
    try {
      const resp = await videoMvp.mutateAsync({ state: workshopState });
      updateMessage(msgId, {
        type: "video",
        content: "🎬 视频已生成",
        meta: {
          video_url: resp.video_url,
          audio_url: resp.audio_url,
          image_count: resp.image_count,
          duration_estimate: resp.duration_estimate,
          task_id: resp.task_id,
        },
      });
    } catch (err) {
      updateMessage(msgId, {
        type: "text",
        content: `❌ 视频合成失败：${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsRunning(false);
    }
  }

  /** 是否可一键成片（需要 visual_output.shot_prompts 非空）。 */
  const canCompose = !!workshopState.visual_output?.shot_prompts?.length;

  return {
    messages,
    workshopState,
    isRunning,
    canCompose,
    runPipeline,
    composeVideo,
    reset,
    loadPlan,
    parseUserInput,
    stream, // 暴露 SSE 流式生成（备选路径）
  };
}
