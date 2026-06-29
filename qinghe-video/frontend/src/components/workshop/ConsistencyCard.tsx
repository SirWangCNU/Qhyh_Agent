import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Copy,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConsistencyImageGenerate } from "@/hooks/use-media";
import { resolveMediaUrl } from "@/hooks/use-agents";
import { useWorkshopStore } from "@/stores/workshop-store";
import type { ConsistencyImageType } from "@/types/api";

/** 卡片展示元信息。 */
export const TYPE_META: Record<
  ConsistencyImageType,
  { title: string; emoji: string; placeholder: string; desc: string }
> = {
  character: {
    title: "人物",
    emoji: "🧑",
    desc: "角色设定集（正面/侧面/背面 + 六宫格表情）",
    placeholder: "例：一位 30 岁的果农，戴草帽，穿蓝色围裙，肤色黝黑，笑容朴实",
  },
  object: {
    title: "物品",
    emoji: "📦",
    desc: "3×3 九宫格（6 方向视图 + 3 细节/场景图）",
    placeholder: "例：一筐新鲜红苹果，带水珠，完整果柄，红色饱满，有机种植",
  },
  scene: {
    title: "场景",
    emoji: "🏞️",
    desc: "2×2 四面环视图（正/背/左/右四个方向）",
    placeholder: "例：阳光下的苹果园，成排果树，绿色草地，远处有山，清晨时分",
  },
};

/** 尺寸预设。 */
const SIZE_PRESETS = [
  { value: "1920x1920", label: "1920×1920（默认）" },
  { value: "2048x2048", label: "2048×2048（高清）" },
  { value: "1536x1536", label: "1536×1536（快速）" },
];

/** 暴露给面板的命令式接口（批量生成 / 一键填充）。 */
export interface ConsistencyCardHandle {
  /** 触发生成，返回是否成功。 */
  generate: () => Promise<boolean>;
  /** 填充主体描述与风格偏好（仅覆盖传入的字段）。 */
  fillFields: (fields: { subject?: string; stylePreference?: string }) => void;
}

interface ConsistencyCardProps {
  type: ConsistencyImageType;
  /** 打开放大查看弹窗。 */
  onLightbox: (url: string, prompt: string, title: string, downloadName: string) => void;
}

/**
 * 一致性生图单卡片（人物/物品/场景）。
 * 独立管理主体描述、风格偏好、尺寸预设、参考图；生成成功后写回 store slot 与一致性参考。
 */
export const ConsistencyCard = forwardRef<ConsistencyCardHandle, ConsistencyCardProps>(
  function ConsistencyCard({ type, onLightbox }, ref) {
    const meta = TYPE_META[type];
    const store = useWorkshopStore();
    const generate = useConsistencyImageGenerate();

    const slot = useWorkshopStore((s) =>
      type === "character"
        ? s.mediaResults.characterImage
        : type === "object"
          ? s.mediaResults.objectImage
          : s.mediaResults.sceneImage,
    );

    const [subject, setSubject] = useState("");
    const [stylePref, setStylePref] = useState("");
    const [sizePreset, setSizePreset] = useState("1920x1920");
    const [refImage, setRefImage] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [localError, setLocalError] = useState("");
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback((file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setLocalError("请上传图片文件（PNG / JPG / WebP）");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setLocalError("图片大小不能超过 10MB");
        return;
      }
      setLocalError("");
      setRefImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }, []);

    function handleDrop(e: React.DragEvent) {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files?.[0] ?? null);
    }

    function clearImage() {
      setRefImage(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

    async function handleGenerate(): Promise<boolean> {
      if (!subject.trim()) {
        setLocalError("请填写主体描述");
        return false;
      }
      setLocalError("");
      // 标记 loading
      store.setConsistencyImage(type, {
        url: "",
        prompt: "",
        mode: "text_to_image",
        status: "loading",
      });
      try {
        const resp = await generate.mutateAsync({
          imageType: type,
          subject: subject.trim(),
          stylePreference: stylePref.trim() || undefined,
          size: sizePreset,
          referenceImage: refImage,
        });
        store.setConsistencyImage(type, {
          url: resp.image_url,
          prompt: resp.prompt,
          mode: resp.consistency_mode,
          status: "done",
        });
        // 写入一致性参考，供 visual_designer 注入
        store.setConsistencyReferences(type, subject.trim());
        // 任意一张成功 → 步骤 done
        store.setStepStatus("consistency_images", "done");
        store.setStepOutput("consistency_images", {
          type,
          url: resp.image_url,
          mode: resp.consistency_mode,
        });
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        store.setConsistencyImage(type, {
          url: "",
          prompt: "",
          mode: "text_to_image",
          status: "error",
          error: msg,
        });
        setLocalError(msg);
        return false;
      }
    }

    // 暴露命令式接口给面板（批量生成 / 一键填充）
    // 用 ref 持有最新 handleGenerate，避免 useImperativeHandle 依赖频繁重建
    const generateRef = useRef(handleGenerate);
    generateRef.current = handleGenerate;
    useImperativeHandle(ref, () => ({
      generate: () => generateRef.current(),
      fillFields: ({ subject, stylePreference }) => {
        // 仅当对应字段为空时填充，避免覆盖用户手动输入
        if (subject !== undefined && subject.trim()) {
          setSubject((prev) => (prev.trim() ? prev : subject));
        }
        if (stylePreference !== undefined && stylePreference.trim()) {
          setStylePref((prev) => (prev.trim() ? prev : stylePreference));
        }
      },
    }));

    async function handleCopyPrompt() {
      if (!slot?.prompt) return;
      try {
        await navigator.clipboard.writeText(slot.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        setLocalError("复制失败，请手动选择文本复制");
      }
    }

    const isLoading = slot?.status === "loading";
    const resolvedUrl = slot?.url ? resolveMediaUrl(slot.url) : null;
    const downloadName = `${type}_${subject.slice(0, 10) || "output"}.jpg`;

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/20 p-3">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{meta.emoji}</span>
            <span className="text-sm font-medium">{meta.title}</span>
          </div>
          <div className="flex gap-1">
            {slot?.status === "done" && (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                已生成
              </span>
            )}
            {slot?.status === "done" && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                {slot.mode === "image_to_image" ? "图生图" : "文生图"}
              </span>
            )}
          </div>
        </div>
        <p className="text-[11px] text-ink-faint">{meta.desc}</p>

        {/* 主体描述 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-ink-muted">主体描述 *</label>
          <Textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={meta.placeholder}
            rows={3}
            className="resize-none text-xs"
            disabled={isLoading}
          />
        </div>

        {/* 风格偏好 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-ink-muted">风格偏好（可选）</label>
          <Input
            value={stylePref}
            onChange={(e) => setStylePref(e.target.value)}
            placeholder="例：真实棚拍、自然光、暖色调"
            className="text-xs"
            disabled={isLoading}
          />
        </div>

        {/* 尺寸预设 */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-ink-muted">尺寸预设</label>
          <Select value={sizePreset} onValueChange={setSizePreset} disabled={isLoading}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_PRESETS.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 参考图上传（可选） */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-ink-muted">
            参考图（可选，上传后走图生图保证一致性）
          </label>
          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl}
                alt="参考图预览"
                className="h-24 w-full rounded-md border border-border object-cover"
              />
              <button
                onClick={clearImage}
                className="absolute right-1 top-1 rounded-full bg-background/80 p-1 hover:bg-background"
                type="button"
                aria-label="移除参考图"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-3 text-[11px] transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <Upload size={14} className="text-ink-faint" />
              <span className="text-ink-faint">点击或拖拽上传参考图</span>
              <span className="text-[10px] text-ink-faint">PNG / JPG / WebP，≤10MB</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* 错误提示 */}
        {localError && (
          <div className="flex items-start gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{localError}</span>
          </div>
        )}

        {/* 生成按钮 */}
        <Button
          onClick={() => void handleGenerate()}
          disabled={isLoading || !subject.trim()}
          size="sm"
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 生成中...
            </>
          ) : (
            <>生成{refImage ? "（图生图）" : "（文生图）"}</>
          )}
        </Button>

        {/* 结果区 */}
        {slot?.status === "loading" && <Skeleton className="aspect-square w-full" />}
        {slot?.status === "done" && resolvedUrl && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => onLightbox(resolvedUrl, slot.prompt, `${meta.title}一致性参考图`, downloadName)}
              className="group relative block w-full"
              aria-label="放大查看"
            >
              <img
                src={resolvedUrl}
                alt={`${meta.title}一致性参考图`}
                className="w-full rounded-md border border-border"
                loading="lazy"
              />
              <span className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn size={14} />
              </span>
            </button>
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleGenerate()}
                disabled={isLoading}
                className="text-[11px]"
              >
                <RefreshCw size={12} /> 重新生成
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopyPrompt()}
                className="text-[11px]"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "已复制" : "复制 Prompt"}
              </Button>
              <Button variant="outline" size="sm" asChild className="text-[11px]">
                <a href={resolvedUrl} download={downloadName}>
                  <Download size={12} /> 下载
                </a>
              </Button>
            </div>
          </div>
        )}
        {slot?.status === "error" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-center text-[11px] text-destructive">
            生成失败：{slot.error ?? "未知错误"}
          </div>
        )}
      </div>
    );
  },
);
