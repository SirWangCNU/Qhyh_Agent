import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() — 合并 Tailwind 类名，冲突时后者覆盖前者。
 * 用法：cn("px-2", condition && "px-4") → "px-4"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 截断文本到指定长度并加省略号。 */
export function truncate(text: unknown, maxLen: number): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length <= maxLen ? s : s.slice(0, maxLen) + "…";
}

/** 格式化时间戳为 MM-DD HH:mm。 */
export function formatDate(ts?: number | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 简单的 HTML 转义（用于把后端字符串塞进 dangerouslySetInnerHTML 之前的清洗）。 */
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
