import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Music, Video, ImageIcon } from "lucide-react";
import { resolveMediaUrl } from "@/hooks/use-agents";
import {
  ASSET_SOURCE_LABELS,
  type Asset,
  type AssetMediaType,
} from "@/types/api";
import { formatAssetDate, formatBytes } from "./AssetCard";

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
 * 资产预览模态（shadcn Dialog）。
 * - 图：大图预览（max-h-[60vh]）
 * - 视频：原生 video 控件
 * - 音频：原生 audio 控件 + 大图标装饰
 * 含元信息区（来源/类型/大小/时间/meta_json）+ 下载按钮。
 */
export function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps) {
  const open = asset !== null;
  const resolvedUrl = asset ? resolveMediaUrl(asset.url) : null;
  const title = asset?.title?.trim() || asset?.filename || "资产预览";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl gap-3">
        {asset && (
          <>
            {/* 媒体渲染区 */}
            <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-md bg-secondary/20">
              {asset.media_type === "image" && resolvedUrl && (
                <img
                  src={resolvedUrl}
                  alt={title}
                  className="max-h-[60vh] w-full object-contain"
                />
              )}
              {asset.media_type === "video" && resolvedUrl && (
                <video
                  src={resolvedUrl}
                  controls
                  autoPlay
                  className="max-h-[60vh] w-full"
                />
              )}
              {asset.media_type === "audio" && (
                <div className="flex w-full flex-col items-center gap-4 py-10">
                  <Music size={56} className="text-ink-faint" />
                  {resolvedUrl && (
                    <audio src={resolvedUrl} controls autoPlay className="w-full max-w-md" />
                  )}
                </div>
              )}
            </div>

            {/* 元信息区 */}
            <DialogHeader>
              <DialogTitle className="truncate">{title}</DialogTitle>
              <DialogDescription className="sr-only">
                资产详情
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {/* 标签行 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="default">
                  {ASSET_SOURCE_LABELS[asset.source]}
                </Badge>
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
                <div>
                  <span className="text-ink-faint">文件名：</span>
                  <span className="font-mono break-all">{asset.filename}</span>
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
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                    元数据
                  </div>
                  <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-secondary/30 p-2 font-mono text-[10px] text-ink-soft">
                    {JSON.stringify(asset.meta_json, null, 2)}
                  </pre>
                </div>
              )}

              {/* 下载按钮 */}
              {resolvedUrl && (
                <a
                  href={resolvedUrl}
                  download={asset.filename}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block"
                >
                  <Button variant="outline" size="sm">
                    <Download size={14} />
                    下载文件
                  </Button>
                </a>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
