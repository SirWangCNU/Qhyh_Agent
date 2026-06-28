import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { HealthResponse } from "@/types/api";

/**
 * 后端健康检查 hook。
 * - 每 30 秒轮询一次
 * - 网络错误时返回 offline，不抛错（避免控制台噪声）
 *
 * @returns { status: "online" | "offline" | "checking" }
 */
export function useHealth() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: async () => apiGet<HealthResponse>("/api/health"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 10_000,
  });

  let status: "online" | "offline" | "checking" = "checking";
  if (query.isSuccess) status = "online";
  else if (query.isError) status = "offline";

  return {
    status,
    data: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
