import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Music,
  Video,
  ImageIcon,
  Maximize2,
  Minimize2,
  ExternalLink,
} from "lucide-react";

import { resolveMediaUrl } from "@/hooks/use-agents";
import {
  ASSET_SOURCE_LABELS,
  type Asset,
  type AssetMediaType,
} from "@/types/api";
import { formatAssetDate, formatBytes } from "./AssetCard";
import { cn } from "@/lib/utils";

interface AssetPreviewModalProps {
  /** 当前预览的资产；null = 关闭 */
  asset: Asset | null;
  onClose: () => void;
}

/** 媒体类型的中文标签 + 图标。 */
const MEDIA_META: Record<AssetMediaType, { label: string; icon: typeof ImageIcon }> = {
  image: { label: "图片", icon: ImageIcon },
  video: { label: "视频", icon: Video },
  audio: { label: "音频", icon: Music },
};

/**
 * 资产预览弹窗（Lightbox 设计）。
 *
 * 核心交互：
 * - 默认：中等弹窗，图片完整显示
 * - 放大：弹窗扩展为接近全屏的大框，图片随框变大，保持原比例
 * - 放大不改变图片 transform，只改变容器尺寸
 */
export function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps) {
  const open = asset !== null;
  const [expanded, setExpanded] = React.useState(false);
  const resolvedUrl = asset ? resolveMediaUrl(asset.url) : null;
  const title = asset?.title?.trim() || asset?.filename || "资产预览";

  // 关闭弹窗时重置展开状态
  React.useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "flex flex-col overflow-hidden bg-card p-0 shadow-2xl sm:rounded-xl",
          expanded
            ? "!fixed !inset-5 !h-[calc(100vh-2.5rem)] !w-[calc(100vw-2.5rem)] !max-w-none !translate-x-0 !translate-y-0"
            : "max-w-3xl"
        )}
        style={{ padding: 0 }}
      >
        {asset && (
          <>
            {/* 媒体区：深色背景，图片完整显示 */}
            <div className="relative flex flex-1 min-h-0 items-center justify-center bg-[#0a0a0a]">
              {asset.media_type === "image" && resolvedUrl && (
                <img
                  src={resolvedUrl}
                  alt={title}
                  className="h-full w-full object-contain"
                />
              )}
              {asset.media_type === "video" && resolvedUrl && (
                <video
                  src={resolvedUrl}
                  controls
                  autoPlay
                  className="h-full w-full"
                />
              )}
              {asset.media_type === "audio" && (
                <div className="flex flex-col items-center justify-center gap-6 py-16">
                  <Music size={64} className="text-white/40" />
                  {resolvedUrl && (
                    <audio src={resolvedUrl} controls autoPlay className="w-full max-w-md" />
                  )}
                </div>
              )}

              {/* 悬浮工具栏 */}
              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-black/70 p-1.5 shadow-xl backdrop-blur-md">
                {asset.media_type === "image" && (
                  <>
                    <button
                      onClick={() => setExpanded((v) => !v)}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/90 transition-colors hover:bg-white/10"
                      aria-label={expanded ? "缩小" : "放大"}
                    >
                      {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                      {expanded ? "缩小" : "放大"}
                    </button>
                    <div className="h-4 w-px bg-white/20" />
                  </>
                )}
                {resolvedUrl && (
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="新标签打开"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
                {resolvedUrl && (
                  <a
                    href={resolvedUrl}
                    download={asset.filename}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="下载"
                  >
                    <Download size={16} />
                  </a>
                )}
              </div>
            </div>

            {/* 信息区 */}
            <div className="border-t border-border/50 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="line-clamp-2 font-display text-lg font-semibold leading-snug tracking-tight">
                    {title}
                  </DialogTitle>
                  <DialogDescription className="sr-only">资产详情</DialogDescription>
                </div>
              </div>

              {/* 标签行 */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="default">{ASSET_SOURCE_LABELS[asset.source]}</Badge>
                {(() => {
                  const meta = MEDIA_META[asset.media_type];
                  const Icon = meta.icon;
                  return (
                    <Badge variant="secondary">
                      <Icon size={10} className="mr-1" />
                      {meta.label}
                    </Badge>
                  );
                })()}
                {asset.mime_type && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {asset.mime_type}
                  </Badge>
                )}
              </div>

              {/* 详情行 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-soft sm:grid-cols-3">
                <div className="min-w-0">
                  <span className="text-ink-faint">文件名：</span>
                  <span className="break-all font-mono">{asset.filename}</span>
                </div>
                <div>
                  <span className="text-ink-faint">大小：</span>
                  {formatBytes(asset.file_size)}
                </div>
                <div>
                  <span className="text-ink-faint">创建：</span>
                  {formatAssetDate(asset.created_at)}
                </div>
              </div>

              {/* meta_json 展开 */}
              {asset.meta_json && Object.keys(asset.meta_json).length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                    元数据
                  </div>
                  <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-secondary/30 p-2 font-mono text-[10px] text-ink-soft">
                    {JSON.stringify(asset.meta_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
