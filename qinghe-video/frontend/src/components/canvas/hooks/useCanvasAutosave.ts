/**
 * 自动保存 hook：监听画布改动，debounce 2s 后 PUT /api/canvas/projects/{id}。
 *
 * - 仅在 dirty && projectId 存在时触发
 * - 任何 nodes/edges/viewport/name 变动都会重置 2s 计时器
 * - 保存中显示 "saving"，成功 markSaved()（dirty=false, "saved"），失败 "error" 不阻断
 *
 * 在 CanvasPage 顶层调用一次即可。
 */
import { useEffect } from "react";
import { useCanvasStore } from "@/stores/canvas-store";
import { useUpdateCanvasProject } from "@/hooks/use-canvas";

const DEBOUNCE_MS = 2000;

export function useCanvasAutosave() {
  const dirty = useCanvasStore((s) => s.dirty);
  const projectId = useCanvasStore((s) => s.projectId);
  const name = useCanvasStore((s) => s.name);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const viewport = useCanvasStore((s) => s.viewport);
  const setSaveStatus = useCanvasStore((s) => s.setSaveStatus);
  const update = useUpdateCanvasProject();

  useEffect(() => {
    if (!projectId || !dirty) return;
    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        await update.mutateAsync({
          id: projectId,
          body: { name, nodes, edges, viewport },
        });
        useCanvasStore.getState().markSaved();
      } catch (e) {
        console.error("[Canvas] 自动保存失败", e);
        useCanvasStore.getState().setSaveStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, projectId, name, nodes, edges, viewport]);
}
