/**
 * SSE 流解析器。
 * 移植自旧版 app.js 的 parseSSEStream，但改为基于 ReadableStream 默认 reader，
 * 并以回调方式逐事件投递。
 *
 * 后端事件格式：
 *   event: <event-name>
 *   data: <json-string>
 *   <空行>
 */

export type SSEEventHandler = (event: string, data: unknown) => void;

/**
 * 解析 SSE 流。返回一个 Promise，在流结束时 resolve。
 *
 * @param response 已 fetch 出来的 Response（必须包含可读 body）
 * @param onEvent  每解析到一个事件就触发
 */
export async function parseSSEStream(
  response: Response,
  onEvent: SSEEventHandler,
): Promise<void> {
  if (!response.body) throw new Error("Response body is empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const processBuffer = () => {
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? ""; // 最后一段可能不完整，留待下次
    for (const block of parts) {
      if (!block.trim()) continue;
      let event: string | null = null;
      const dataParts: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataParts.push(line.slice(5).trim());
        }
      }
      if (event !== null && dataParts.length > 0) {
        try {
          const data = JSON.parse(dataParts.join(""));
          onEvent(event, data);
        } catch (err) {
          console.error("[SSE] 解析失败", err, dataParts.join(""));
        }
      }
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) processBuffer();
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    processBuffer();
  }
}
