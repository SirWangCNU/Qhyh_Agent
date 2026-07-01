import { useMutation } from "@tanstack/react-query";
import { apiFetch, apiPost, getAuthToken } from "@/lib/api";
import type {
  ConsistencyImageResponse,
  ConsistencyImageType,
  EditImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationRequest,
  TTSRequest,
  TTSResponse,
  VideoComposeRequest,
  VideoComposeResponse,
  VideoMvpRequest,
  VideoMvpResponse,
} from "@/types/api";

/**
 * 一致性生图 hook（POST /api/consistency-images/generate，multipart/form）。
 *
 * 字段：image_type、subject、style_preference?、size?、negative_prompt?、reference_image?(File)
 * 响应：{ status, image_type, image_url, prompt, consistency_mode, subject }
 *
 * 参考图可选：有则图生图，无则纯文生图。
 */
export function useConsistencyImageGenerate() {
  return useMutation({
    mutationFn: async (params: {
      imageType: ConsistencyImageType;
      subject: string;
      stylePreference?: string;
      size?: string;
      negativePrompt?: string;
      referenceImage?: File | null;
    }) => {
      const fd = new FormData();
      fd.append("image_type", params.imageType);
      fd.append("subject", params.subject);
      if (params.stylePreference) fd.append("style_preference", params.stylePreference);
      if (params.size) fd.append("size", params.size);
      if (params.negativePrompt) fd.append("negative_prompt", params.negativePrompt);
      if (params.referenceImage) fd.append("reference_image", params.referenceImage);

      const token = getAuthToken();
      const backend = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "");
      const resp = await fetch(`${backend}/api/consistency-images/generate`, {
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
      return (await resp.json()) as ConsistencyImageResponse;
    },
  });
}

/** 图片生成 hook（POST /api/images/generate）。 */
export function useGenerateImage() {
  return useMutation({
    mutationFn: (req: ImageGenerationRequest) =>
      apiPost<ImageGenerationResponse>("/api/images/generate", req),
  });
}

/** gpt-image-2 图片编辑/生成 hook（POST /api/images/edit-generate）。 */
export function useGenerateEditImage() {
  return useMutation({
    mutationFn: (req: EditImageGenerationRequest) =>
      apiPost<ImageGenerationResponse>("/api/images/edit-generate", req),
  });
}

/** TTS 配音 hook（POST /api/tts/generate）。 */
export function useGenerateTTS() {
  return useMutation({
    mutationFn: (req: TTSRequest) => apiPost<TTSResponse>("/api/tts/generate", req),
  });
}

/** 视频合成 hook（POST /api/video/compose）。 */
export function useComposeVideo() {
  return useMutation({
    mutationFn: (req: VideoComposeRequest) =>
      apiPost<VideoComposeResponse>("/api/video/compose", req),
  });
}

/** 一键成片 hook（POST /api/video/mvp）。 */
export function useVideoMvp() {
  return useMutation({
    mutationFn: (req: VideoMvpRequest) =>
      apiFetch<VideoMvpResponse>("/api/video/mvp", {
        method: "POST",
        body: req as unknown as BodyInit,
      }),
  });
}
