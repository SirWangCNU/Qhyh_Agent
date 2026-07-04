/**
 * 对话创作 Agent 的 SSE 流解析器。
 *
 * 后端 conversation_agent 输出格式（与主流水线 /api/generate/stream 不同）：
 *   data: {"event":"think","data":{"iteration":1,"content":"..."}}\n\n
 *
 * 即只有单行 data:，event 字段嵌在 JSON payload 内部，
 * 不兼容 lib/sse.ts 的 parseSSEStream（后者要求 event: 前缀行）。
 */

import type { ConversationEvent } from "@/types/api";

/**
 * 解析对话创作 Agent 的 SSE 流，逐事件回调。
 *
 * @param response 已 fetch 出来的 Response（必须包含可读 body）
 * @param onEvent  每解析到一个 ConversationEvent 就触发
 */
export async function parseConversationSSE(
  response: Response,
  onEvent: (ev: ConversationEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("Response body is empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const flush = () => {
    // SSE 块以空行分隔
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? ""; // 最后一段可能不完整，留待下次
    for (const block of parts) {
      if (!block.trim()) continue;
      // 提取所有 data: 行（后端只发单行 data:，但兼容多行拼接）
      const dataLines = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim());
      if (dataLines.length === 0) continue;
      try {
        const payload = JSON.parse(dataLines.join(""));
        // 校验：必须有 event 字符串 + data 对象
        if (
          payload &&
          typeof payload.event === "string" &&
          payload.data != null
        ) {
          onEvent(payload as ConversationEvent);
        }
      } catch (err) {
        console.error("[conversation-sse] 解析失败", err, dataLines.join(""));
      }
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) flush();
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    flush();
  }
}
