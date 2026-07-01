/**
 * 左侧工具栏：节点拖拽源。
 *
 * 每项 draggable，onDragStart 写入 dataTransfer（含可选 preset），拖到画布后由 useCanvasDnd.onDrop 落点创建节点。
 * onDragStart 由 CanvasPage 通过共享 useCanvasDnd 注入，确保与画布 drop 共用同一份 dnd 逻辑。
 *
 * 注意：TOOLBAR_ITEMS 允许同 kind 多项（如 prompt 有「提示词」「故事板文本」「系统提示词」3 个），
 * React key 用 label 而非 kind 避免冲突。
 */
import {
  TOOLBAR_ITEMS,
  type CanvasNodeData,
  type CanvasNodeKind,
} from "@/components/canvas/types";
import { cn } from "@/lib/utils";

interface CanvasToolbarProps {
  onDragStart: (
    e: React.DragEvent,
    kind: CanvasNodeKind,
    preset?: Partial<CanvasNodeData>,
  ) => void;
}

export function CanvasToolbar({ onDragStart }: CanvasToolbarProps) {
  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-r bg-card py-3">
      <span className="text-[10px] font-medium text-muted-foreground">节点</span>
      <div className="flex flex-col gap-1.5">
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            draggable
            onDragStart={(e) => onDragStart(e, item.kind, item.preset)}
            title={`拖拽到画布添加：${item.label}`}
            className={cn(
              "flex h-12 w-12 cursor-grab flex-col items-center justify-center gap-0.5 rounded-md border bg-background text-muted-foreground transition-colors",
              "hover:border-primary hover:text-primary hover:shadow-sm active:cursor-grabbing",
            )}
          >
            <span className="text-lg leading-none">{item.emoji}</span>
            <span className="text-[10px] leading-none">{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
