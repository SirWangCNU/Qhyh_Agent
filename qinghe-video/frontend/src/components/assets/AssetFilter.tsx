import { ImageIcon, Music, Video, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ASSET_SOURCE_LABELS,
  type AssetMediaType,
  type AssetSource,
  type AssetStats,
} from "@/types/api";

/** 全部 AssetSource 值（固定顺序，与中文标签对应）。 */
const SOURCE_KEYS = Object.keys(ASSET_SOURCE_LABELS) as AssetSource[];

interface AssetFilterProps {
  selectedSource: AssetSource | "";
  selectedMediaType: AssetMediaType | "";
  stats: AssetStats[] | undefined;
  onSourceChange: (s: AssetSource | "") => void;
  onMediaTypeChange: (m: AssetMediaType | "") => void;
}

/** 媒体类型筛选选项。 */
const MEDIA_OPTIONS: Array<{ value: AssetMediaType | ""; label: string; icon: typeof ImageIcon }> = [
  { value: "", label: "全部", icon: Layers },
  { value: "image", label: "图片", icon: ImageIcon },
  { value: "video", label: "视频", icon: Video },
  { value: "audio", label: "音频", icon: Music },
];

/**
 * 资产筛选器：来源 chips（带统计数量）+ 媒体类型筛选。
 * 两行垂直排列，每行 flex-wrap，gap-2。
 */
export function AssetFilter({
  selectedSource,
  selectedMediaType,
  stats,
  onSourceChange,
  onMediaTypeChange,
}: AssetFilterProps) {
  /** 从 stats 查找指定来源的数量。 */
  function countOf(source: AssetSource): number {
    const hit = stats?.find((s) => s.source === source);
    return hit?.count ?? 0;
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-card p-3">
      {/* 来源 chips 行 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSourceChange("")}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-all",
            selectedSource === ""
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-ink-soft hover:border-primary/40 hover:text-ink",
          )}
        >
          全部
        </button>
        {SOURCE_KEYS.map((src) => {
          const active = selectedSource === src;
          const count = countOf(src);
          return (
            <button
              key={src}
              type="button"
              onClick={() => onSourceChange(active ? "" : src)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-all",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-ink-soft hover:border-primary/40 hover:text-ink",
                count === 0 && !active && "opacity-50",
              )}
            >
              {ASSET_SOURCE_LABELS[src]}
              <span
                className={cn(
                  "ml-1 font-mono text-[10px]",
                  active ? "text-primary-foreground/80" : "text-ink-faint",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 媒体类型行 */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-ink-faint">
          类型
        </span>
        {MEDIA_OPTIONS.map((opt) => {
          const active = selectedMediaType === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value || "all"}
              type="button"
              onClick={() => onMediaTypeChange(active ? "" : opt.value)}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-all",
                active
                  ? "border-primary bg-primary/5 text-ink ring-1 ring-primary/30"
                  : "border-border bg-background text-ink-soft hover:border-primary/40 hover:text-ink",
              )}
            >
              <Icon size={12} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
