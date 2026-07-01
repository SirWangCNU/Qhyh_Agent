/**
 * 提示词节点（支持 role 区分）。
 *
 * - 一个提示词 Textarea
 * - 右侧 source Handle：拉线到 segment / generate 节点
 * - 头部根据 data.role 显示对应 emoji + label：
 *   - system     → ⚙️ 系统提示词
 *   - storyboard → 📜 故事板文本
 *   - generic    → ✍️ 提示词（默认）
 *
 * 多个提示词节点的文本在生成时按入边收集并换行拼接（由 collectSegmentInputs 按 role 分类）。
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasStore } from "@/stores/canvas-store";
import type { PromptNodeData, PromptRole } from "@/components/canvas/types";
import { cn } from "@/lib/utils";

/** 角色 → 头部展示元数据。 */
const ROLE_META: Record<
  PromptRole,
  { label: string; emoji: string; accent: string }
> = {
  system: { label: "系统提示词", emoji: "⚙️", accent: "bg-blue-500/10 text-blue-600" },
  storyboard: { label: "故事板文本", emoji: "📜", accent: "bg-amber-500/10 text-amber-600" },
  generic: { label: "提示词", emoji: "✍️", accent: "bg-primary/10 text-primary" },
};

export function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as PromptNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const role: PromptRole = d.role ?? "generic";
  const meta = ROLE_META[role];

  return (
    <Card
      className={cn(
        "w-64 gap-0 p-0 shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 border-b px-2.5 py-1.5",
          meta.accent,
        )}
      >
        <span className="text-xs">{meta.emoji}</span>
        <span className="text-xs font-medium">{meta.label}</span>
      </div>
      <div className="p-2.5">
        <Textarea
          value={d.prompt}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="描述想要生成的内容…"
          className="h-28 resize-none text-xs"
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </Card>
  );
}
