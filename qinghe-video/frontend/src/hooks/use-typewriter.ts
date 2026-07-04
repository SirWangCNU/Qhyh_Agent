/**
 * 打字机效果 hook。
 *
 * 用于模拟对话创作 Agent 答案的"流式输出"：后端 answer 事件一次性给出
 * 完整答案，前端把它缓存后逐字显示。支持跳过动画、自动追加增量文本。
 *
 * @param fullText  要显示的完整文本
 * @param active    是否启用打字机动画
 * @param delayMs   每个字符间隔（默认 14ms）
 */

import { useEffect, useRef, useState, useCallback } from "react";

export function useTypewriter(fullText: string, active: boolean, delayMs = 14) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const fullRef = useRef(fullText);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // fullText 变化时同步到 ref，并继续从当前 index 打字
  useEffect(() => {
    if (fullText === fullRef.current) return;

    if (fullText.startsWith(fullRef.current)) {
      // 增量追加：保持已有 index，继续打字
      fullRef.current = fullText;
      setDone(false);
    } else {
      // 全新答案：重置
      fullRef.current = fullText;
      indexRef.current = 0;
      setDisplayed("");
      setDone(false);
    }
  }, [fullText]);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setDisplayed(fullRef.current);
      indexRef.current = fullRef.current.length;
      setDone(true);
      return;
    }

    timerRef.current = setInterval(() => {
      const target = fullRef.current;
      if (indexRef.current >= target.length) {
        setDone(true);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        return;
      }

      // 中文长文本可适当一次前进 1-2 字符，保持流畅感
      const step = Math.max(1, Math.round(16 / delayMs));
      const nextIndex = Math.min(indexRef.current + step, target.length);
      indexRef.current = nextIndex;
      setDisplayed(target.slice(0, nextIndex));
    }, delayMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, delayMs]);

  const skip = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    indexRef.current = fullRef.current.length;
    setDisplayed(fullRef.current);
    setDone(true);
  }, []);

  return { displayed, done, skip };
}
