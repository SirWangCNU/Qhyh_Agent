import { cn } from "@/lib/utils";
import { NODE_META, type NodeKey } from "@/lib/constants";
import type { NodeState } from "@/stores/pipeline-store";

interface PipelineNodeProps {
  nodeKey: NodeKey;
  state: NodeState;
  step: number;
  /** 紧凑模式：用于侧边栏（隐藏 desc）。 */
  compact?: boolean;
}

const stateClasses: Record<NodeState, string> = {
  idle: "opacity-60",
  active: "border-primary bg-primary/5 ring-2 ring-primary/30",
  done: "border-success/40 bg-success/10 text-success",
  error: "border-destructive bg-destructive/10 text-destructive",
};

/**
 * 单个流水线节点。
 * 状态映射：idle / active / done / error
 */
export function PipelineNode({ nodeKey, state, step, compact = false }: PipelineNodeProps) {
  const meta = NODE_META[nodeKey];
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 transition-all",
        stateClasses[state],
        compact && "py-1",
      )}
      aria-label={`${meta.label} - ${stateLabel(state)}`}
      role="status"
      aria-live="polite"
    >
      <span className="text-base leading-none" aria-hidden="true">
        {meta.emoji}
      </span>
      {!compact && (
        <span className="flex flex-1 flex-col">
          <span className="text-xs font-medium text-ink">{meta.label}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            {meta.kicker}
          </span>
        </span>
      )}
      <span className="font-mono text-[10px] text-ink-faint">
        {String(step + 1).padStart(2, "0")}
      </span>
      {state === "done" && (
        <span className="text-success" aria-hidden="true">
          ✓
        </span>
      )}
      {state === "error" && (
        <span className="text-destructive" aria-hidden="true">
          !
        </span>
      )}
    </div>
  );
}

function stateLabel(s: NodeState) {
  switch (s) {
    case "active":
      return "执行中";
    case "done":
      return "已完成";
    case "error":
      return "出错";
    default:
      return "等待中";
  }
}
