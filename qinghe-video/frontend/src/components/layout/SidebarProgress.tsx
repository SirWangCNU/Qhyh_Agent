import { AnimatePresence, motion } from "framer-motion";
import { usePipelineStore } from "@/stores/pipeline-store";
import { PipelineFlow } from "@/components/pipeline/PipelineFlow";
import { cn } from "@/lib/utils";

interface SidebarProgressProps {
  collapsed: boolean;
}

/**
 * 侧边栏中的流水线进度区块。
 * 仅当存在 active task（taskId 非空）时渲染。
 */
export function SidebarProgress({ collapsed }: SidebarProgressProps) {
  const taskId = usePipelineStore((s) => s.taskId);
  const progress = usePipelineStore((s) => s.progress);
  const statusText = usePipelineStore((s) => s.statusText);

  return (
    <AnimatePresence initial={false}>
      {taskId && !collapsed && (
        <motion.section
          className="mx-3 rounded-md border border-border bg-card/60 p-3"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          aria-label="当前生成进度"
        >
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-faint">
            <span>当前任务</span>
            <span className="font-mono">{taskId}</span>
          </div>

          <PipelineFlow compact />

          <div className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
            <span
              className="font-mono"
              aria-label="整体进度"
            >
              {Math.round(progress * 100)}%
            </span>
            <span className="truncate" aria-hidden="true">
              ·
            </span>
            <span
              className="truncate"
              // statusText 中允许 <strong>，已在源头清洗
              dangerouslySetInnerHTML={{ __html: statusText }}
            />
          </div>
        </motion.section>
      )}

      {/* 折叠模式下：仅显示一个小型进度环 */}
      {taskId && collapsed && (
        <motion.div
          className="flex justify-center px-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-label={`任务进行中：${Math.round(progress * 100)}%`}
        >
          <div
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full border-2 border-primary text-[10px] font-mono text-primary",
            )}
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {Math.round(progress * 100)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
