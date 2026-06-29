/**
 * 顶部项目栏。
 *
 * - 左：项目名 Input（失焦/回车提交）+ 保存状态 Badge
 * - 中：项目下拉切换（来自 useCanvasProjects）+ 新建按钮
 * - 右：删除按钮（Dialog 二次确认）
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useCanvasStore, type SaveStatus } from "@/stores/canvas-store";
import {
  useCanvasProjects,
  useCreateCanvasProject,
  useDeleteCanvasProject,
} from "@/hooks/use-canvas";
import { formatDate } from "@/lib/utils";

const SAVE_STATUS_META: Record<
  SaveStatus,
  { label: string; variant: "secondary" | "default" | "success" | "destructive" }
> = {
  idle: { label: "已同步", variant: "secondary" },
  saving: { label: "保存中…", variant: "default" },
  saved: { label: "已保存", variant: "success" },
  error: { label: "保存失败", variant: "destructive" },
};

export function CanvasProjectBar() {
  const projectId = useCanvasStore((s) => s.projectId);
  const name = useCanvasStore((s) => s.name);
  const saveStatus = useCanvasStore((s) => s.saveStatus);
  const setName = useCanvasStore((s) => s.setName);
  const loadProject = useCanvasStore((s) => s.loadProject);
  const switchProject = useCanvasStore((s) => s.switchProject);
  const reset = useCanvasStore((s) => s.reset);

  const projectsQuery = useCanvasProjects();
  const createMutation = useCreateCanvasProject();
  const deleteMutation = useDeleteCanvasProject();

  const [nameDraft, setNameDraft] = useState(name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // 项目切换时同步名称草稿
  useEffect(() => {
    setNameDraft(name);
  }, [name, projectId]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== name) {
      setName(trimmed);
    } else {
      setNameDraft(name);
    }
  };

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

  const handleDelete = async () => {
    if (!projectId) return;
    try {
      await deleteMutation.mutateAsync(projectId);
      setDeleteOpen(false);
      reset();
    } catch (e) {
      console.error("[Canvas] 删除项目失败", e);
    }
  };

  const statusMeta = SAVE_STATUS_META[saveStatus];

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
      {/* 左：项目名 + 保存状态 */}
      <div className="flex items-center gap-2">
        <Folder className="h-4 w-4 text-muted-foreground" />
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 w-48 text-sm"
          placeholder="项目名称"
        />
        <Badge variant={statusMeta.variant} className="text-[10px]">
          {statusMeta.label}
        </Badge>
      </div>

      <div className="mx-2 h-6 w-px bg-border" />

      {/* 中：项目切换 */}
      <div className="flex items-center gap-2">
        <Select
          value={projectId ?? ""}
          onValueChange={(v) => switchProject(v)}
        >
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder="选择项目…" />
          </SelectTrigger>
          <SelectContent>
            {projectsQuery.data?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="truncate">{p.name}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {formatDate(p.updated_at)}
                </span>
              </SelectItem>
            ))}
            {!projectsQuery.data?.length && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                暂无项目
              </div>
            )}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={handleCreate}
          disabled={createMutation.isPending}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          新建
        </Button>
      </div>

      <div className="flex-1" />

      {/* 右：删除 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs text-destructive hover:text-destructive"
            disabled={!projectId || deleteMutation.isPending}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            删除
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除画布项目</DialogTitle>
            <DialogDescription>
              确认删除项目「{name}」？此操作不可撤销，项目内所有节点与连线将被清除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
