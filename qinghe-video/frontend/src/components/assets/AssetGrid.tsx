import { AssetCard } from "./AssetCard";
import type { Asset } from "@/types/api";

interface AssetGridProps {
  assets: Asset[];
  onDelete: (id: number) => void;
  onPreview: (asset: Asset) => void;
  /** 正在删除的 id */
  deletingId?: number | null;
}

/**
 * 资产网格容器。
 * 响应式列数：2 / 3 / 4 / 5，每个 AssetCard 自带 staggered 入场动画。
 */
export function AssetGrid({ assets, onDelete, onPreview, deletingId }: AssetGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {assets.map((asset, idx) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          index={idx}
          onDelete={onDelete}
          onPreview={onPreview}
          deletingId={deletingId}
        />
      ))}
    </div>
  );
}
