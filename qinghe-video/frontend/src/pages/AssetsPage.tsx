import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Loader2,
  AlertCircle,
  PackageOpen,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetGrid } from "@/components/assets/AssetGrid";
import { AssetFilter } from "@/components/assets/AssetFilter";
import { AssetPreviewModal } from "@/components/assets/AssetPreviewModal";
import {
  useAssets,
  useAssetStats,
  useDeleteAsset,
  useUploadAsset,
} from "@/hooks/use-assets";
import type { Asset, AssetMediaType, AssetSource } from "@/types/api";

/** 单页大小（与后端默认一致）。 */
const PAGE_SIZE = 20;
/** 上传文件大小上限 50MB。 */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * 我的资产页（#/assets）。
 *
 * 功能：
 * - 浏览用户所有资产（自动收集 + 手动上传），按来源/类型筛选 + 分页
 * - 上传新资产（图片/视频/音频）
 * - 点击卡片预览大图/视频/音频
 * - 删除资产（级联删物理文件）
 */
export function AssetsPage() {
  const [selectedSource, setSelectedSource] = useState<AssetSource | "">("");
  const [selectedMediaType, setSelectedMediaType] = useState<AssetMediaType | "">("");
  const [page, setPage] = useState(1);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadMsg, setUploadMsg] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const statsQ = useAssetStats();
  const listQ = useAssets({
    source: selectedSource,
    media_type: selectedMediaType,
    page,
    page_size: PAGE_SIZE,
  });
  const delMut = useDeleteAsset();
  const upMut = useUploadAsset();

  function handleSourceChange(s: AssetSource | "") {
    setSelectedSource(s);
    setPage(1);
  }

  function handleMediaTypeChange(m: AssetMediaType | "") {
    setSelectedMediaType(m);
    setPage(1);
  }

  /** 选择文件后立即上传。 */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // 清空 input value 允许重复选同一文件
    e.target.value = "";

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadMsg(`文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 50MB`);
      return;
    }
    setUploadMsg("");
    try {
      await upMut.mutateAsync({
        file,
        title: uploadTitle.trim() || undefined,
      });
      setUploadTitle("");
      setUploadMsg(`已上传：${file.name}`);
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : String(err));
    }
  }

  /** 删除资产。 */
  async function handleDelete(id: number) {
    try {
      await delMut.mutateAsync(id);
      // 若当前页删空且非首页，回退一页
      const items = listQ.data?.items ?? [];
      if (items.length <= 1 && page > 1) {
        setPage((p) => Math.max(1, p - 1));
      }
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "删除失败");
    }
  }

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isLoading = listQ.isPending;
  const isError = listQ.isError;

  return (
    <section className="container-app py-10">
      <div className="module__head">
        <span className="eyebrow">
          <span className="num">07</span>
          我的资产
        </span>
        <h2 className="section-title">资产库 · 图片 / 视频 / 音频</h2>
        <p className="section-desc">
          管理由各生成模块自动收集与手动上传的素材，按来源分类，持久化保存。
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {/* 上传区 */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="upload-title">标题（可选）</Label>
              <Input
                id="upload-title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="给上传的资产起个名字"
                className="mt-1"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={(e) => void handleFileChange(e)}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={upMut.isPending}
            >
              {upMut.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  上传中
                </>
              ) : (
                <>
                  <Upload size={16} />
                  上传资产
                </>
              )}
            </Button>
          </div>
          {uploadMsg && (
            <div
              className={`mt-2 flex items-center gap-1.5 text-xs ${
                uploadMsg.startsWith("已上传") ? "text-success" : "text-destructive"
              }`}
            >
              {uploadMsg.startsWith("已上传") ? (
                <RefreshCw size={12} />
              ) : (
                <AlertCircle size={12} />
              )}
              {uploadMsg}
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-ink-faint">
            支持 PNG/JPG/WebP/GIF/MP4/MP3，单文件最大 50MB
          </p>
        </div>

        {/* 筛选器 */}
        <AssetFilter
          selectedSource={selectedSource}
          selectedMediaType={selectedMediaType}
          stats={statsQ.data}
          onSourceChange={handleSourceChange}
          onMediaTypeChange={handleMediaTypeChange}
        />

        {/* 资产网格区 */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-border">
                <Skeleton className="aspect-square w-full rounded-none" />
                <div className="space-y-1.5 p-2.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 py-12 text-center">
            <AlertCircle size={32} className="text-destructive" />
            <p className="mt-2 text-sm text-destructive">
              {listQ.error?.message ?? "加载失败"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void listQ.refetch()}
            >
              <RefreshCw size={14} />
              重试
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 py-16 text-center">
            <PackageOpen size={40} className="text-ink-faint" />
            <p className="mt-3 text-sm text-ink-soft">还没有资产</p>
            <p className="mt-1 text-xs text-ink-faint">
              去生成视频 / 图片 / 配音，或点击上方「上传资产」
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AssetGrid
              assets={items}
              onDelete={(id) => void handleDelete(id)}
              onPreview={setPreviewAsset}
              deletingId={delMut.isPending ? delMut.variables ?? null : null}
            />
          </motion.div>
        )}

        {/* 分页 */}
        {!isLoading && !isError && total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
              上一页
            </Button>
            <span className="font-mono text-xs text-ink-soft">
              第 {page} / {totalPages} 页 · 共 {total} 项
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
              <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </div>

      {/* 预览模态 */}
      <AssetPreviewModal
        asset={previewAsset}
        onClose={() => setPreviewAsset(null)}
      />
    </section>
  );
}
