import { motion } from "framer-motion";
import { Trash2, Music, Video, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { resolveMediaUrl } from "@/hooks/use-agents";
import { ASSET_SOURCE_LABELS, type Asset } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * 把字节数格式化为人类可读字符串。
 * 1024 → "1.0 KB"；1048576 → "1.0 MB"；null/0 → "—"
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(val < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

/**
 * 把 ISO 时间字符串格式化为短显示。
 * "2026-06-29T10:00:00" → "06-29 10:00"
 */
export function formatAssetDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

interface AssetCardProps {
  asset: Asset;
  /** 用于入场动画 staggered delay */
  index: number;
  onDelete: (id: number) => void;
  onPreview: (asset: Asset) => void;
  /** 正在删除的 id，用于禁用按钮 + 显示 loading */
  deletingId?: number | null;
}

/**
 * 单资产卡片。
 * - 缩略图：image→img / video→video(metadata)+播放图标 / audio→Music 图标
 * - 标题：asset.title ?? asset.filename
 * - 元信息：来源 Badge + 文件大小 + 创建时间
 * - 删除按钮（右上角悬浮，window.confirm 二次确认）
 * - 点击卡片（非删除区）→ onPreview
 */
export function AssetCard({
  asset,
  index,
  onDelete,
  onPreview,
  deletingId,
}: AssetCardProps) {
  const resolvedUrl = resolveMediaUrl(asset.url);
  const isDeleting = deletingId === asset.id;
  const title = asset.title?.trim() || asset.filename;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (window.confirm("确定删除该资产？删除后文件不可恢复。")) {
      onDelete(asset.id);
    }
  }

  function handleCardClick() {
    if (!isDeleting) onPreview(asset);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -2 }}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-all",
        "hover:border-primary/40 hover:shadow-md",
        isDeleting && "opacity-50 pointer-events-none",
      )}
    >
      {/* 缩略图区 */}
      <div className="relative aspect-square bg-secondary/30">
        {asset.media_type === "image" && resolvedUrl && (
          <img
            src={resolvedUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}

        {asset.media_type === "video" && resolvedUrl && (
          <>
            <video
              src={resolvedUrl}
              preload="metadata"
              muted
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 grid place-items-center bg-black/20">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white">
                <Play size={18} fill="currentColor" />
              </span>
            </div>
          </>
        )}

        {asset.media_type === "video" && !resolvedUrl && (
          <div className="flex h-full items-center justify-center text-ink-faint">
            <Video size={32} />
          </div>
        )}

        {asset.media_type === "audio" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-faint">
            <Music size={32} />
            <div className="flex items-end gap-0.5">
              {[6, 12, 8, 16, 10, 14, 7].map((h, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-ink-faint/50"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 删除按钮 */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label="删除资产"
          className={cn(
            "absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1.5 text-ink-soft backdrop-blur-sm",
            "opacity-0 transition-opacity hover:text-destructive",
            "group-hover:opacity-100 focus:opacity-100",
          )}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 信息区 */}
      <div className="space-y-1.5 p-2.5">
        <p className="truncate text-xs font-medium text-ink" title={title}>
          {title}
        </p>
        <div className="flex items-center justify-between gap-1">
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {ASSET_SOURCE_LABELS[asset.source]}
          </Badge>
          <span className="font-mono text-[10px] text-ink-faint">
            {formatBytes(asset.file_size)}
          </span>
        </div>
        <div className="font-mono text-[10px] text-ink-faint">
          {formatAssetDate(asset.created_at)}
        </div>
      </div>
    </motion.div>
  );
}
