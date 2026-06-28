import { useHealth } from "@/hooks/use-health";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 后端健康状态指示器：绿点（在线）/ 红点（离线）/ 灰点（检测中）。
 * 30 秒轮询一次。
 */
export function HealthPill() {
  const { status, data } = useHealth();

  const styles = {
    online: { dot: "bg-success", text: "后端在线" },
    offline: { dot: "bg-destructive", text: "后端离线" },
    checking: { dot: "bg-ink-faint", text: "检测中" },
  } as const;

  const cur = styles[status];

  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium"
      title={`后端服务状态：${cur.text}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          cur.dot,
          status === "checking" && "animate-pulse",
        )}
        aria-hidden="true"
      />
      {data ? (
        <span className="text-ink-soft">{cur.text}</span>
      ) : (
        <Skeleton className="h-3 w-16" aria-hidden="true" />
      )}
      <span className="sr-only">{cur.text}</span>
    </span>
  );
}
