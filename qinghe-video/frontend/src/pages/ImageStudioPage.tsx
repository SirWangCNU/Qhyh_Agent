import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Loader2,
  Sparkles,
  Download,
  RefreshCw,
  ImageIcon,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useImageStudioGenerate } from "@/hooks/use-media";
import { resolveMediaUrl } from "@/hooks/use-agents";
import { cn } from "@/lib/utils";
import type { ImageStudioImageType, ImageStudioResponse, ImageStudioVariant } from "@/types/api";

/** 9 个维度元信息（与后端 image_studio.py 顺序对齐）。 */
const DIMENSIONS: Array<{ key: string; label: string; hint: string }> = [
  { key: "lighting", label: "光线", hint: "顺光 / 逆光 / 侧光" },
  { key: "perspective", label: "视角", hint: "平视 / 俯拍 / 仰角" },
  { key: "scene", label: "场景", hint: "田间 / 厨房 / 餐桌" },
  { key: "color_tone", label: "色调", hint: "暖调 / 冷调 / 复古" },
  { key: "composition", label: "构图", hint: "居中 / 三分 / 对角" },
  { key: "mood", label: "氛围", hint: "清新 / 温暖 / 质朴" },
  { key: "material", label: "材质", hint: "粗糙 / 光泽 / 通透" },
  { key: "lens", label: "镜头", hint: "广角 / 微距 / 长焦" },
  { key: "art_style", label: "艺术风格", hint: "写实 / 油画 / 极简" },
];

/**
 * 图像处理工作室（#/image-studio）— 九宫格导演板。
 *
 * 功能：
 * - 上传物品或人物参考图（拖拽 / 点击）
 * - 沿 9 个维度生成风格变体，拼成 3×3 导演板
 * - 一致性 key 标识，可下载九宫格大图
 */
export function ImageStudioPage() {
  const [imageType, setImageType] = useState<ImageStudioImageType>("product");
  const [subject, setSubject] = useState("");
  const [stylePreference, setStylePreference] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImageStudioResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const generate = useImageStudioGenerate();

  /** 处理文件选择。 */
  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("请上传图片文件（PNG / JPG / WebP）");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("图片大小不能超过 10MB");
      return;
    }
    setErrorMsg("");
    setReferenceImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  /** 拖拽上传。 */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function clearImage() {
    setReferenceImage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetAll() {
    clearImage();
    setResult(null);
    setErrorMsg("");
    setSubject("");
    setStylePreference("");
  }

  async function handleGenerate() {
    if (!referenceImage) {
      setErrorMsg("请先上传参考图");
      return;
    }
    if (!subject.trim()) {
      setErrorMsg("请填写主体描述");
      return;
    }
    setErrorMsg("");
    setResult(null);
    try {
      const resp = await generate.mutateAsync({
        imageType,
        subject: subject.trim(),
        stylePreference: stylePreference.trim() || undefined,
        referenceImage,
      });
      setResult(resp);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  const isGenerating = generate.isPending;

  // 把 variants 数组按 9 维度顺序对齐（容错：若后端返回不全则补占位）
  const variantMap = new Map<number, ImageStudioVariant>();
  result?.variants.forEach((v) => variantMap.set(v.variant_id, v));

  return (
    <section className="container-app py-10">
      <div className="module__head">
        <span className="eyebrow">
          <span className="num">★</span>
          图像处理工作室
        </span>
        <h2 className="section-title">九宫格导演板 · 人物物品一致性生成</h2>
        <p className="section-desc">
          上传物品或人物参考图，沿 9 个维度生成风格变体，拼成 3×3 导演板，用于广告视频创作参考。
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* 左侧：表单 */}
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <Label>主体类型</Label>
            <div className="mt-1.5 flex gap-2">
              {(
                [
                  { value: "product", label: "物品 / 农产品" },
                  { value: "person", label: "人物" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setImageType(opt.value)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm transition-all",
                    "hover:scale-[1.01] active:scale-[0.99]",
                    imageType === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30 text-ink"
                      : "border-border bg-background text-ink-soft hover:border-primary/40",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="subject">
              主体描述 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={imageType === "product" ? "如：阳山水蜜桃" : "如：30岁女性农户"}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="style_preference">风格偏好（可选）</Label>
            <Input
              id="style_preference"
              value={stylePreference}
              onChange={(e) => setStylePreference(e.target.value)}
              placeholder="如：清新自然 / 复古胶片 / 极简主义"
              className="mt-1"
            />
          </div>

          {/* 拖拽上传区 */}
          <div>
            <Label>
              参考图 <span className="text-destructive">*</span>
            </Label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "mt-1.5 relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:border-primary/40",
              )}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {previewUrl ? (
                <div className="relative w-full">
                  <img
                    src={previewUrl}
                    alt="参考图预览"
                    className="mx-auto max-h-[180px] rounded-md object-contain"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearImage();
                    }}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-ink-soft hover:text-destructive"
                    aria-label="移除图片"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={28} className="text-ink-faint" />
                  <p className="text-sm text-ink-soft">
                    点击或拖拽图片到此处
                    <br />
                    <span className="text-xs text-ink-faint">PNG / JPG / WebP，最大 10MB</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle size={14} className="mr-1 inline" />
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => void handleGenerate()}
              disabled={isGenerating || !referenceImage || !subject.trim()}
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  生成九宫格中
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  生成九宫格
                </>
              )}
            </Button>
            <Button variant="outline" onClick={resetAll} disabled={isGenerating}>
              重置
            </Button>
          </div>

          {/* 一致性 key */}
          {result?.consistency_key && (
            <div className="rounded-md border border-border bg-secondary/30 p-2.5 text-xs">
              <div className="flex items-center gap-1.5 text-ink-soft">
                <Check size={12} className="text-success" />
                一致性 Key
              </div>
              <code className="mt-1 block break-all font-mono text-[11px] text-ink">
                {result.consistency_key}
              </code>
            </div>
          )}
        </div>

        {/* 右侧：九宫格展示 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">3×3 导演板</h3>
              <p className="text-xs text-ink-soft">9 个维度的风格变体，用于创作参考与对比。</p>
            </div>
            {result?.grid_url && (
              <a
                href={resolveMediaUrl(result.grid_url) ?? "#"}
                download
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="outline" size="sm">
                  <Download size={14} />
                  下载大图
                </Button>
              </a>
            )}
          </div>

          {/* 九宫格大图预览 */}
          {result?.grid_url && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-lg border border-border bg-secondary/20"
            >
              <img
                src={resolveMediaUrl(result.grid_url) ?? undefined}
                alt="九宫格导演板"
                className="w-full object-contain"
                loading="lazy"
              />
            </motion.div>
          )}

          {/* 9 个维度卡片 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {DIMENSIONS.map((dim, idx) => {
              const variant = variantMap.get(idx);
              return (
                <DimensionCard
                  key={dim.key}
                  dim={dim}
                  idx={idx}
                  variant={variant}
                  isGenerating={isGenerating}
                  hasResult={!!result}
                />
              );
            })}
          </div>

          {/* 空状态 */}
          {!result && !isGenerating && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-16 text-center">
              <ImageIcon size={40} className="text-ink-faint" />
              <p className="mt-3 text-sm text-ink-soft">
                上传参考图并填写主体描述后
                <br />
                点击「生成九宫格」开始
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** 单个维度卡片：loading → done / error → idle。 */
function DimensionCard({
  dim,
  idx,
  variant,
  isGenerating,
  hasResult,
}: {
  dim: { key: string; label: string; hint: string };
  idx: number;
  variant?: ImageStudioVariant;
  isGenerating: boolean;
  hasResult: boolean;
}) {
  const url = variant
    ? variant.image_url
      ? resolveMediaUrl(variant.image_url) ?? undefined
      : variant.b64_json
        ? `data:image/png;base64,${variant.b64_json}`
        : undefined
    : undefined;

  const isError = hasResult && !!variant?.error && !url;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: idx * 0.04 }}
      className="overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="relative aspect-square bg-secondary/30">
        {isGenerating && !url && (
          <Skeleton className="h-full w-full" />
        )}
        {url && (
          <img
            src={url}
            alt={`${dim.label}变体`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
        {isError && (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-destructive">
            <AlertCircle size={16} />
            <span>生成失败</span>
          </div>
        )}
        {!isGenerating && !hasResult && (
          <div className="flex h-full items-center justify-center text-ink-faint">
            <ImageIcon size={20} />
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink">{dim.label}</span>
          <span className="font-mono text-[10px] text-ink-faint">
            {String(idx + 1).padStart(2, "0")}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-ink-faint">{dim.hint}</p>
        {variant?.dimension && variant.dimension !== dim.key && (
          <Badge variant="outline" className="mt-1 text-[9px]">
            {variant.dimension}
          </Badge>
        )}
      </div>
    </motion.div>
  );
}
