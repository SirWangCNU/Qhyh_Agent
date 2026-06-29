/**
 * 无限画布页面（路由入口）。
 *
 * 三栏布局：顶部 CanvasProjectBar + 左 CanvasToolbar + 中 CanvasFlow + 右 NodeInspector。
 *
 * 生命周期：
 * - 挂载时 hydrate（从 sessionStorage 恢复 projectId/name）
 * - useCanvasProject(projectId) 拉取完整项目数据，到货后 loadProject
 * - useCanvasAutosave 监听 dirty，debounce 2s 自动保存
 * - useCanvasDnd 在本页共享一份实例，onDragStart→Toolbar，onDrop/onInit→CanvasFlow
 *
 * 无项目时显示居中「新建画布」空状态。
 */
import { useEffect } from "react";
import { LayoutGrid, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  useCanvasProject,
  useCreateCanvasProject,
} from "@/hooks/use-canvas";
import { useCanvasDnd } from "@/components/canvas/hooks/useCanvasDnd";
import { useCanvasAutosave } from "@/components/canvas/hooks/useCanvasAutosave";
import { CanvasProjectBar } from "@/components/canvas/panels/CanvasProjectBar";
import { CanvasToolbar } from "@/components/canvas/panels/CanvasToolbar";
import { NodeInspector } from "@/components/canvas/panels/NodeInspector";
import { CanvasFlow } from "@/components/canvas/CanvasFlow";

export function CanvasPage() {
  useCanvasAutosave();

  const projectId = useCanvasStore((s) => s.projectId);
  const loaded = useCanvasStore((s) => s.loaded);
  const loadProject = useCanvasStore((s) => s.loadProject);
  const hydrate = useCanvasStore((s) => s.hydrate);

  const dnd = useCanvasDnd();
  const { data, isFetching } = useCanvasProject(projectId);
  const createMutation = useCreateCanvasProject();

  // 首次挂载：从 sessionStorage 恢复 projectId
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 项目数据到货且未加载 → 载入 store
  useEffect(() => {
    if (data && !loaded) {
      loadProject({
        id: data.id,
        name: data.name,
        nodes: data.nodes,
        edges: data.edges,
        viewport: data.viewport,
      });
    }
  }, [data, loaded, loadProject]);

  const handleCreate = async () => {
    try {
      const res = await createMutation.mutateAsync({
        name: `未命名画布 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      loadProject({
        id: res.id,
        name: res.name,
        nodes: res.nodes,
        edges: res.edges,
        viewport: res.viewport,
      });
    } catch (e) {
      console.error("[Canvas] 创建项目失败", e);
    }
  };

  // 空状态：无项目
  if (!projectId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CanvasProjectBar />
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <LayoutGrid className="h-16 w-16" />
            <div className="text-center">
              <p className="text-base font-medium text-foreground">
                开始你的无限画布
              </p>
              <p className="mt-1 text-xs">
                拖拽参考图、撰写提示词、连线生成节点，像即梦 / 可灵一样创作
              </p>
            </div>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              新建画布
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 加载中（切换项目后等待数据）
  if (!loaded && isFetching) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CanvasProjectBar />
        <div className="flex flex-1 items-center justify-center bg-muted/30 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CanvasProjectBar />
      <div className="flex min-h-0 flex-1">
        <CanvasToolbar onDragStart={dnd.onDragStart} />
        <div className="min-w-0 flex-1">
          <CanvasFlow
            onDrop={dnd.onDrop}
            onDragOver={dnd.onDragOver}
            onInit={dnd.setReactFlowInstance}
          />
        </div>
        <NodeInspector />
      </div>
    </div>
  );
}
