import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/** 一致性生图放大查看弹窗（基于 shadcn Dialog）。 */
export interface ConsistencyLightboxState {
  url: string;
  prompt: string;
  title: string;
  /** 下载文件名（不含路径）。 */
  downloadName?: string;
}

export function ConsistencyLightbox({
  state,
  onOpenChange,
}: {
  state: ConsistencyLightboxState | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{state?.title ?? "一致性参考图"}</DialogTitle>
          <DialogDescription>点击图片外区域或右上角关闭</DialogDescription>
        </DialogHeader>
        {state && (
          <div className="space-y-3">
            <img
              src={state.url}
              alt={state.title}
              className="max-h-[70vh] w-full rounded-md border border-border object-contain"
            />
            <div className="rounded-md border border-border bg-secondary/30 p-2.5">
              <div className="mb-1 text-[11px] font-medium text-ink-muted">生成 Prompt</div>
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all text-[11px] text-ink-soft">
                {state.prompt || "（无 prompt）"}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full">
              <a href={state.url} download={state.downloadName ?? "consistency.jpg"}>
                <Download size={14} /> 下载图片
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
