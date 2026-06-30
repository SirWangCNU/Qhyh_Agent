import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet, getAuthToken } from "@/lib/api";
import type {
  Asset,
  AssetDeleteResponse,
  AssetListResponse,
  AssetStats,
  AssetSource,
  AssetMediaType,
} from "@/types/api";

/** 资产列表查询参数。 */
export interface AssetListQuery {
  source?: AssetSource | "";
  media_type?: AssetMediaType | "";
  page?: number;
  page_size?: number;
}

/** 把查询参数拼成 query string（过滤空值）。 */
function buildQuery(params: AssetListQuery): string {
  const sp = new URLSearchParams();
  if (params.source) sp.set("source", params.source);
  if (params.media_type) sp.set("media_type", params.media_type);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * 资产列表 hook（GET /api/assets）。
 * - 支持 source / media_type 筛选 + 分页
 * - staleTime 0，保证切换筛选立即刷新
 */
export function useAssets(query: AssetListQuery) {
  return useQuery({
    queryKey: ["assets", query],
    queryFn: () => apiGet<AssetListResponse>(`/api/assets${buildQuery(query)}`),
    staleTime: 0,
  });
}

/** 来源统计 hook（GET /api/assets/stats）。 */
export function useAssetStats() {
  return useQuery({
    queryKey: ["assets", "stats"],
    queryFn: () => apiGet<AssetStats[]>("/api/assets/stats"),
    staleTime: 30_000,
  });
}

/**
 * 删除资产 hook（DELETE /api/assets/{id}）。
 * 成功后失效资产列表与统计缓存。
 */
export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: number) =>
      apiFetch<AssetDeleteResponse>(`/api/assets/${assetId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

/** 上传资产请求参数。 */
export interface AssetUploadParams {
  file: File;
  title?: string;
  source?: AssetSource;
}

/**
 * 手动上传资产 hook（POST /api/assets/upload，multipart/form-data）。
 *
 * FormData 走原生 fetch（绕过 apiFetch 的 JSON 序列化），手动注入 Authorization。
 * 参考 use-media.ts 的 useConsistencyImageGenerate 模式。
 */
export function useUploadAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, title, source }: AssetUploadParams) => {
      const fd = new FormData();
      fd.append("file", file);
      if (title) fd.append("title", title);
      fd.append("source", source ?? "upload");

      const token = getAuthToken();
      const backend = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "");
      const resp = await fetch(`${backend}/api/assets/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        let detail = `HTTP ${resp.status}`;
        try {
          const data = await resp.json();
          if (data?.detail) detail = String(data.detail);
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      return (await resp.json()) as Asset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}
