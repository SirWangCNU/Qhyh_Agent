import { motion } from "framer-motion";
import { usePipelineStore } from "@/stores/pipeline-store";
import { NODE_ORDER } from "@/lib/constants";
import { PipelineNode } from "./PipelineNode";
import { cn } from "@/lib/utils";

interface PipelineFlowProps {
  /** 紧凑模式：用于侧边栏。 */
  compact?: boolean;
  className?: string;
}

/**
 * 流水线节点视觉流：6 个节点纵向排列，附带状态行 + 进度条。
 * 状态来自 pipeline-store。
 */
export function PipelineFlow({ compact = false, className }: PipelineFlowProps) {
  const nodes = usePipelineStore((s) => s.nodes);
  const progress = usePipelineStore((s) => s.progress);
  const statusText = usePipelineStore((s) => s.statusText);
  const statusType = usePipelineStore((s) => s.statusType);

  return (
    <div className={cn("flex flex-col gap-2", className)} aria-label="流水线进度">
      <div className="flex flex-col gap-1.5">
        {NODE_ORDER.map((key, idx) => (
          <PipelineNode key={key} nodeKey={key} state={nodes[key]} step={idx} compact={compact} />
        ))}
      </div>

      {/* 进度条 */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className={cn(
            "h-full rounded-full",
            statusType === "error" ? "bg-destructive" : "bg-primary",
          )}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        />
      </div>

      {/* 状态行 */}
      <p
        className={cn(
          "text-xs leading-relaxed",
          statusType === "error" && "text-destructive",
          statusType === "success" && "text-success",
          (statusType === "idle" || statusType === "info") && "text-ink-soft",
        )}
        // statusText 中允许 <strong>，已在源头清洗（来自后端 task_id/节点名等）
        dangerouslySetInnerHTML={{ __html: statusText }}
      />
    </div>
  );
}
