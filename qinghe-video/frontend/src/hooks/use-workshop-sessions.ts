/**
 * 工坊会话 react-query hooks。
 *
 * 封装所有 /api/workshop/sessions/* 调用，与后端 src/workshop_sessions/router.py 端点一一对应。
 * 全部走 lib/api.ts 的 apiFetch/apiGet/apiPost，自动注入 Bearer token。
 *
 * 镜像 use-canvas.ts 的模式：
 * - 列表/详情用 useQuery
 * - 创建/更新/删除用 useMutation，成功后 invalidate 列表
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiGet, apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type {
  WorkshopSessionCreateInput,
  WorkshopSessionDTO,
  WorkshopSessionSummaryDTO,
  WorkshopSessionUpdateInput,
} from "@/types/api";

// ============================================================
// Query keys
// ============================================================

const QK = {
  sessions: ["workshop", "sessions"] as const,
  session: (id: string) => ["workshop", "sessions", id] as const,
};

// ============================================================
// Hooks
// ============================================================

/** 列出当前用户所有工坊会话。 GET /api/workshop/sessions */
export function useWorkshopSessions() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: QK.sessions,
    queryFn: () =>
      apiGet<WorkshopSessionSummaryDTO[]>("/api/workshop/sessions"),
    enabled: !!token,
  });
}

/** 获取单个工坊会话完整数据。 GET /api/workshop/sessions/{id} */
export function useWorkshopSession(id: string | null) {
  return useQuery({
    queryKey: id ? QK.session(id) : ["workshop", "sessions", "__none__"],
    queryFn: () => apiGet<WorkshopSessionDTO>(`/api/workshop/sessions/${id}`),
    enabled: !!id,
  });
}

/** 创建工坊会话。 POST /api/workshop/sessions */
export function useCreateWorkshopSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkshopSessionCreateInput) =>
      apiPost<WorkshopSessionDTO>("/api/workshop/sessions", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.sessions });
    },
  });
}

/** 更新工坊会话（自动保存）。 PUT /api/workshop/sessions/{id} */
export function useUpdateWorkshopSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: WorkshopSessionUpdateInput;
    }) =>
      apiFetch<WorkshopSessionDTO>(`/api/workshop/sessions/${id}`, {
        method: "PUT",
        body: body as BodyInit,
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: QK.sessions });
      qc.invalidateQueries({ queryKey: QK.session(id) });
    },
  });
}

/** 删除工坊会话。 DELETE /api/workshop/sessions/{id} */
export function useDeleteWorkshopSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ status: string }>(`/api/workshop/sessions/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.sessions });
    },
  });
}
