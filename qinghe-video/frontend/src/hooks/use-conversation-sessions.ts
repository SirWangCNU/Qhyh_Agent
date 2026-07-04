/**
 * 对话会话 react-query hooks。
 *
 * 封装所有 /api/conversation-sessions/* 调用，与后端
 * src/conversation_sessions/router.py 端点一一对应。
 * 镜像 use-workshop-sessions.ts 的模式：
 * - 列表/详情用 useQuery（带 enabled: !!token 守卫）
 * - 创建/删除/重命名用 useMutation，成功后 invalidate 列表
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiGet, apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type {
  ConversationCreateInput,
  ConversationDetailDTO,
  ConversationListResponse,
  ConversationMessageCreateInput,
  ConversationMessageDTO,
  ConversationSummaryDTO,
} from "@/types/api";

const QK = {
  list: ["conversations", "list"] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
};

/** 列出当前用户对话会话。 GET /api/conversation-sessions */
export function useConversationSessions() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: QK.list,
    queryFn: () =>
      apiGet<ConversationListResponse>("/api/conversation-sessions"),
    enabled: !!token,
    staleTime: 30_000,
  });
}

/** 获取单个对话会话详情（含消息）。 GET /api/conversation-sessions/{id} */
export function useConversationDetail(id: string | null) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: id ? QK.detail(id) : ["conversations", "detail", "__none__"],
    queryFn: () =>
      apiGet<ConversationDetailDTO>(`/api/conversation-sessions/${id}`),
    enabled: !!id && !!token,
  });
}

/** 创建对话会话。 POST /api/conversation-sessions */
export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConversationCreateInput) =>
      apiPost<ConversationSummaryDTO>("/api/conversation-sessions", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.list });
    },
  });
}

/** 追加消息。 POST /api/conversation-sessions/{id}/messages */
export function useAppendConversationMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: ConversationMessageCreateInput;
    }) =>
      apiPost<ConversationMessageDTO>(
        `/api/conversation-sessions/${id}/messages`,
        body,
      ),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: QK.list });
      qc.invalidateQueries({ queryKey: QK.detail(id) });
    },
  });
}

/** 重命名会话。 PUT /api/conversation-sessions/{id} */
export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch<ConversationSummaryDTO>(`/api/conversation-sessions/${id}`, {
        method: "PUT",
        body: { title } as unknown as BodyInit,
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: QK.list });
      qc.invalidateQueries({ queryKey: QK.detail(id) });
    },
  });
}

/** 删除会话。 DELETE /api/conversation-sessions/{id} */
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ status: string }>(`/api/conversation-sessions/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.list });
    },
  });
}
