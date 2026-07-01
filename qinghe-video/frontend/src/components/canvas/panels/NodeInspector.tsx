/**
 * 右侧属性面板：按选中节点 kind 渲染对应编辑表单。
 *
 * 无选中时显示项目统计（节点数 / 连线数）。
 * 编辑通过 updateNodeData 回写 store，与节点内编辑完全同步。
 */
import { useRef } from "react";
import { Upload, MousePointerClick, Download, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCanvasStore } from "@/stores/canvas-store";
import { useCanvasUpload, useCanvasModels } from "@/hooks/use-canvas";
import {
  FALLBACK_MODEL_OPTIONS,
  GENERATE_STATUS_META,
  MODE_OPTIONS,
  REF_TYPE_OPTIONS,
  SHOT_REF_TYPE_OPTIONS,
  SIZE_OPTIONS,
  type CanvasNodeData,
  type GenerateNodeData,
  type ImageNodeData,
  type PromptNodeData,
  type PromptRole,
  type ReferenceImageNodeData,
  type ShotNodeData,
} from "@/components/canvas/types";
import { PromptMentionTextarea } from "@/components/canvas/shared/PromptMentionTextarea";

export function NodeInspector() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const upload = useCanvasUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const node = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  const handleReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedNodeId) return;
    try {
      const res = await upload.mutateAsync(file);
      updateNodeData(selectedNodeId, { imageUrl: res.url });
    } catch (err) {
      console.error("[Canvas] 参考图重新上传失败", err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const BACKEND = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "");

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-card p-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleReupload}
      />

      {!node && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <MousePointerClick className="h-8 w-8" />
          <p className="text-xs">选择一个节点以编辑属性</p>
          <div className="mt-4 w-full rounded-md border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between">
              <span>节点数</span>
              <span className="font-medium">{nodes.length}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>连线数</span>
              <span className="font-medium">{edges.length}</span>
            </div>
          </div>
        </div>
      )}

      {node && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              节点属性
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => removeNode(node.id)}
            >
              删除节点
            </Button>
          </div>

          {(node.data as { kind: string }).kind === "referenceImage" && (
            <ReferenceImageEditor
              key={node.id}
              id={node.id}
              data={node.data as ReferenceImageNodeData}
              updateNodeData={updateNodeData}
              onReupload={() => fileInputRef.current?.click()}
              uploading={upload.isPending}
            />
          )}

          {(node.data as { kind: string }).kind === "prompt" && (
            <PromptEditor
              key={node.id}
              id={node.id}
              data={node.data as PromptNodeData}
              updateNodeData={updateNodeData}
            />
          )}

          {(node.data as { kind: string }).kind === "generate" && (
            <GenerateEditor
              key={node.id}
              id={node.id}
              data={node.data as GenerateNodeData}
              updateNodeData={updateNodeData}
            />
          )}

          {(node.data as { kind: string }).kind === "image" && (
            <ImageEditor
              data={node.data as ImageNodeData}
              backend={BACKEND}
            />
          )}

          {(node.data as { kind: string }).kind === "shot" && (
            <ShotEditor
              key={node.id}
              id={node.id}
              data={node.data as ShotNodeData}
              updateNodeData={updateNodeData}
            />
          )}
        </>
      )}
    </aside>
  );
}

// ============================================================
// 各 kind 编辑器子组件
// ============================================================

type UpdateFn = (
  id: string,
  patch: Partial<CanvasNodeData>,
) => void;

function ReferenceImageEditor({
  id,
  data,
  updateNodeData,
  onReupload,
  uploading,
}: {
  id: string;
  data: ReferenceImageNodeData;
  updateNodeData: UpdateFn;
  onReupload: () => void;
  uploading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">🖼️ 参考图</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            备注
          </label>
          <Input
            value={data.label}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            参考维度
          </label>
          <Select
            value={data.refType}
            onValueChange={(v) =>
              updateNodeData(id, {
                refType: v as ReferenceImageNodeData["refType"],
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REF_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: o.color }}
                  />
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data.imageUrl && (
          <img
            src={data.imageUrl}
            alt={data.label}
            className="h-28 w-full rounded border object-contain"
          />
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-xs"
          disabled={uploading}
          onClick={onReupload}
        >
          <Upload className="mr-1 h-3.5 w-3.5" />
          {uploading ? "上传中…" : data.imageUrl ? "重新上传" : "上传图片"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PromptEditor({
  id,
  data,
  updateNodeData,
}: {
  id: string;
  data: PromptNodeData;
  updateNodeData: UpdateFn;
}) {
  const role: PromptRole = data.role ?? "generic";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">✍️ 提示词</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            角色
          </label>
          <Select
            value={role}
            onValueChange={(v) =>
              updateNodeData(id, { role: v as PromptRole })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="generic" className="text-xs">
                ✍️ 通用提示词
              </SelectItem>
              <SelectItem value="storyboard" className="text-xs">
                📜 故事板文本
              </SelectItem>
              <SelectItem value="system" className="text-xs">
                ⚙️ 系统提示词
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={data.prompt}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="描述想要生成的内容…"
          className="h-32 resize-none text-xs"
        />
      </CardContent>
    </Card>
  );
}

function GenerateEditor({
  id,
  data,
  updateNodeData,
}: {
  id: string;
  data: GenerateNodeData;
  updateNodeData: UpdateFn;
}) {
  const statusMeta = GENERATE_STATUS_META[data.status] ?? GENERATE_STATUS_META.idle;
  const modelsQuery = useCanvasModels();
  const modelOptions =
    modelsQuery.data && modelsQuery.data.length > 0
      ? modelsQuery.data
      : FALLBACK_MODEL_OPTIONS;
  const model = data.model ?? "";
  const prompt = data.prompt ?? "";
  const negativePrompt = data.negative_prompt ?? "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">⚡ 生成</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            状态
          </span>
          <Badge variant={statusMeta.variant} className="text-[10px]">
            {statusMeta.label}
          </Badge>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            生成类型
          </label>
          <Select
            value={data.mode}
            onValueChange={(v) =>
              updateNodeData(id, {
                mode: v as GenerateNodeData["mode"],
                status: "idle",
                error: undefined,
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            模型
          </label>
          <Select
            value={model}
            onValueChange={(v) => updateNodeData(id, { model: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent className="w-[var(--radix-select-trigger-width)]">
              {modelOptions.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  <span className="block truncate" title={m}>
                    {m}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            输出尺寸
          </label>
          <Select
            value={data.size}
            onValueChange={(v) => updateNodeData(id, { size: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            提示词（输入 @ 引用图片）
          </label>
          <PromptMentionTextarea
            value={prompt}
            onChange={(v) => updateNodeData(id, { prompt: v })}
            placeholder="描述想要生成的内容…"
            className="h-28"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            负向提示词
          </label>
          <Textarea
            value={negativePrompt}
            onChange={(e) =>
              updateNodeData(id, { negative_prompt: e.target.value })
            }
            placeholder="不希望出现的元素…"
            className="h-20 resize-none text-xs"
          />
        </div>
        {data.error && (
          <p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-xs"
          onClick={() =>
            updateNodeData(id, {
              status: "idle",
              error: undefined,
            })
          }
        >
          重置状态
        </Button>
      </CardContent>
    </Card>
  );
}

function ImageEditor({
  data,
  backend,
}: {
  data: ImageNodeData;
  backend: string;
}) {
  const label = data.label || (data.index ? String(data.index) : "结果图");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">📷 图片{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {data.imageUrl ? (
          <>
            <img
              src={data.imageUrl}
              alt="结果图"
              className="h-40 w-full rounded border object-contain"
            />
            <div className="flex gap-1.5">
              <Button asChild variant="outline" size="sm" className="h-8 flex-1 text-xs">
                <a
                  href={`${backend}${data.imageUrl}`}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  下载
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 flex-1 text-xs">
                <a
                  href={`${backend}${data.imageUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  打开
                </a>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">暂无结果图</p>
        )}
      </CardContent>
    </Card>
  );
}

function ShotEditor({
  id,
  data,
  updateNodeData,
}: {
  id: string;
  data: ShotNodeData;
  updateNodeData: UpdateFn;
}) {
  const statusMeta = GENERATE_STATUS_META[data.status] ?? GENERATE_STATUS_META.idle;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">🎬 分镜</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            状态
          </span>
          <Badge variant={statusMeta.variant} className="text-[10px]">
            {statusMeta.label}
          </Badge>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            镜号标题
          </label>
          <Input
            value={data.title}
            onChange={(e) => updateNodeData(id, { title: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            画面描述 / 提示词
          </label>
          <Textarea
            value={data.visualPrompt}
            onChange={(e) =>
              updateNodeData(id, { visualPrompt: e.target.value })
            }
            placeholder="本镜画面描述…"
            className="h-24 resize-none text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            旁白
          </label>
          <Textarea
            value={data.narration}
            onChange={(e) => updateNodeData(id, { narration: e.target.value })}
            placeholder="本镜旁白文本…"
            className="h-16 resize-none text-xs"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              时长(秒)
            </label>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={data.duration}
              onChange={(e) =>
                updateNodeData(id, {
                  duration: Math.max(0.1, Number(e.target.value) || 3.5),
                })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              参考类型
            </label>
            <Select
              value={data.referenceType ?? ""}
              onValueChange={(v) =>
                updateNodeData(id, {
                  referenceType: (v || undefined) as
                    | ShotNodeData["referenceType"]
                    | undefined,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="自动" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="" className="text-xs">
                  自动
                </SelectItem>
                {SHOT_REF_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: o.color }}
                    />
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            参考图 URL（可选）
          </label>
          <Input
            value={data.referenceImageUrl ?? ""}
            onChange={(e) =>
              updateNodeData(id, {
                referenceImageUrl: e.target.value || undefined,
              })
            }
            placeholder="/outputs/upload/xxx.jpg"
            className="h-8 text-xs"
          />
        </div>
        {data.resultImageUrl && (
          <img
            src={data.resultImageUrl}
            alt="结果图"
            className="h-32 w-full rounded border object-contain"
          />
        )}
        {data.error && (
          <p className="rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-xs"
          onClick={() =>
            updateNodeData(id, {
              status: "idle",
              error: undefined,
            })
          }
        >
          重置状态
        </Button>
      </CardContent>
    </Card>
  );
}
