/**
 * 无限画布 react-query hooks。
 *
 * 封装所有 /api/canvas/* 调用，与后端 src/canvas/router.py 端点一一对应。
 * 全部走 lib/api.ts 的 apiFetch/apiGet/apiPost，自动注入 Bearer token。
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiGet, apiPost } from "@/lib/api";
import type { Edge, Viewport } from "@xyflow/react";
import type { CanvasNode, RefType } from "@/components/canvas/types";
import type {
  SegmentGenerateRequestDTO,
  SegmentGenerateResponseDTO,
  StoryboardComposeRequestDTO,
  StoryboardComposeResponseDTO,
  StoryboardGenerateRequestDTO,
  StoryboardGenerateResponseDTO,
} from "@/types/api";

// ============================================================
// API DTO（与后端 src/canvas/models.py 对齐）
// ============================================================

export interface CanvasProjectDTO {
  id: string;
  name: string;
  nodes: CanvasNode[];
  edges: Edge[];
  viewport: Viewport;
  created_at: string;
  updated_at: string;
}

export interface CanvasProjectSummaryDTO {
  id: string;
  name: string;
  thumbnail_url: string | null;
  node_count: number;
  updated_at: string;
}

export interface CanvasProjectCreateInput {
  name: string;
  nodes?: CanvasNode[];
  edges?: Edge[];
  viewport?: Viewport;
}

export interface CanvasProjectUpdateInput {
  name?: string;
  nodes?: CanvasNode[];
  edges?: Edge[];
  viewport?: Viewport;
}

export interface ReferenceInputDTO {
  image_url: string;
  ref_type: RefType;
}

export interface GenerateRequestInput {
  node_id: string;
  references: ReferenceInputDTO[];
  prompt: string;
  negative_prompt?: string;
  params?: Record<string, unknown>;
}

export interface GenerateResultDTO {
  node_id: string;
  status: "idle" | "running" | "done" | "error";
  result_image_url: string | null;
  error: string | null;
}

export interface UploadResponseDTO {
  url: string;
  upload_id: string;
  filename: string;
  file_size: number;
}

// ============================================================
// Query keys
// ============================================================

const QK = {
  projects: ["canvas", "projects"] as const,
  project: (id: string) => ["canvas", "projects", id] as const,
};

// ============================================================
// Hooks
// ============================================================

/** 列出当前用户所有画布项目。 GET /api/canvas/projects */
export function useCanvasProjects() {
  return useQuery({
    queryKey: QK.projects,
    queryFn: () => apiGet<CanvasProjectSummaryDTO[]>("/api/canvas/projects"),
  });
}

/** 获取单个画布项目完整数据。 GET /api/canvas/projects/{id} */
export function useCanvasProject(id: string | null) {
  return useQuery({
    queryKey: id ? QK.project(id) : ["canvas", "projects", "__none__"],
    queryFn: () => apiGet<CanvasProjectDTO>(`/api/canvas/projects/${id}`),
    enabled: !!id,
  });
}

/** 创建画布项目。 POST /api/canvas/projects */
export function useCreateCanvasProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CanvasProjectCreateInput) =>
      apiPost<CanvasProjectDTO>("/api/canvas/projects", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.projects });
    },
  });
}

/** 更新画布项目（自动保存）。 PUT /api/canvas/projects/{id} */
export function useUpdateCanvasProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: CanvasProjectUpdateInput;
    }) =>
      apiFetch<CanvasProjectDTO>(`/api/canvas/projects/${id}`, {
        method: "PUT",
        body: body as BodyInit,
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: QK.projects });
      qc.invalidateQueries({ queryKey: QK.project(id) });
    },
  });
}

/** 删除画布项目。 DELETE /api/canvas/projects/{id} */
export function useDeleteCanvasProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ status: string }>(`/api/canvas/projects/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.projects });
    },
  });
}

/** 触发生成节点。 POST /api/canvas/projects/{id}/generate */
export function useCanvasGenerateMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: GenerateRequestInput;
    }) =>
      apiPost<GenerateResultDTO>(
        `/api/canvas/projects/${projectId}/generate`,
        body,
      ),
  });
}

/** 上传参考图。 POST /api/canvas/upload (multipart/form-data) */
export function useCanvasUpload() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      // apiFetch 对 FormData 自动跳过 JSON.stringify（见 lib/api.ts 第 46 行判断）
      return apiFetch<UploadResponseDTO>("/api/canvas/upload", {
        method: "POST",
        body: fd,
        json: false,
      });
    },
  });
}

/** 获取可选图片模型列表。 GET /api/canvas/models
 *
 * 失败时返回前端兜底列表，保证生成节点下拉框始终可用。
 */
export function useCanvasModels() {
  return useQuery<string[]>({
    queryKey: ["canvas", "models"] as const,
    queryFn: () => apiGet<string[]>("/api/canvas/models"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ============================================================
// 故事板（Storyboard）API
// ============================================================

/** 批量生成故事板分镜图片。 POST /api/canvas/projects/{id}/storyboard/generate */
export function useStoryboardGenerateMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: StoryboardGenerateRequestDTO;
    }) =>
      apiPost<StoryboardGenerateResponseDTO>(
        `/api/canvas/projects/${projectId}/storyboard/generate`,
        body,
      ),
  });
}

/** 批量生成段级导演板图。 POST /api/canvas/projects/{id}/storyboard/segment-generate */
export function useStoryboardSegmentGenerateMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: SegmentGenerateRequestDTO;
    }) =>
      apiPost<SegmentGenerateResponseDTO>(
        `/api/canvas/projects/${projectId}/storyboard/segment-generate`,
        body,
      ),
  });
}

/** 故事板分镜图合成视频。 POST /api/canvas/projects/{id}/storyboard/compose */
export function useStoryboardComposeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: StoryboardComposeRequestDTO;
    }) =>
      apiPost<StoryboardComposeResponseDTO>(
        `/api/canvas/projects/${projectId}/storyboard/compose`,
        body,
      ),
    onSuccess: () => {
      // 合成完成后刷新资产列表（视频/音频会落库到资产表）
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}
