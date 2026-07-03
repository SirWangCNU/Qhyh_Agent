/**
 * 节点删除按钮：hover 卡片时右上角浮出，点击调用 removeNode。
 *
 * 设计：胶片「撕角」隐喻——一个斜切的红色小方块，hover 微微旋转放大。
 * - 常态隐藏（opacity-0），父卡片 hover 时 opacity-100 滑出
 * - 生成中（running）禁用，避免删掉正在工作的节点
 * - 点击 stopPropagation 防止冒泡触发卡片其他交互
 *
 * 用法：在节点 Card 内部 absolute 定位放一个即可。
 *   <NodeDeleteButton nodeId={id} disabled={running} />
 */
import { X } from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import { cn } from "@/lib/utils";

export function NodeDeleteButton({
  nodeId,
  disabled,
}: {
  nodeId: string;
  disabled?: boolean;
}) {
  const removeNode = useCanvasStore((s) => s.removeNode);

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) removeNode(nodeId);
      }}
      title={disabled ? "生成中，无法删除" : "删除节点"}
      className={cn(
        "absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-sm border border-destructive/30 bg-destructive/90 text-destructive-foreground shadow-sm transition-all duration-150",
        "opacity-0 group-hover:opacity-100 hover:scale-110 hover:bg-destructive",
        "disabled:cursor-not-allowed disabled:opacity-0",
      )}
    >
      <X className="h-3 w-3" strokeWidth={2.5} />
    </button>
  );
}
