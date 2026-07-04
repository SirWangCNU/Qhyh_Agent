import { useAuthStore } from "@/stores/auth-store";
import { STORAGE_KEYS } from "./constants";

/**
 * 业务 API 请求错误。
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface FetchOptions extends RequestInit {
  /** 是否跳过 Authorization 头（如登录接口本身）。 */
  skipAuth?: boolean;
  /** 是否将 body 自动 JSON.stringify（默认 true）。 */
  json?: boolean;
}

/**
 * 统一的 fetch 封装：
 * - 自动注入 `Authorization: Bearer <token>`
 * - 401 时清除鉴权状态，触发 AuthOverlay
 * - 非 2xx 抛出 ApiError（带 status code）
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: FetchOptions = {},
): Promise<T> {
  const { skipAuth = false, json = true, headers, body, ...rest } = opts;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = useAuthStore.getState().token;
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let finalBody = body;
  if (body !== undefined && json && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }

  const url = path.startsWith("http") ? path : `${import.meta.env.VITE_BACKEND_URL ?? ""}${path}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body: finalBody,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? `网络请求失败：${err.message}` : "网络请求失败",
    );
  }

  if (resp.status === 401 && !skipAuth) {
    // 仅当请求确实带了 token（登录态失效）才 logout；
    // 若请求未带 token（未登录或 hydrate 未完成），不破坏 localStorage
    if (finalHeaders.Authorization) {
      useAuthStore.getState().logout();
      throw new ApiError("登录已失效，请重新登录", 401);
    }
    throw new ApiError("未登录", 401);
  }

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const data = await resp.json();
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* 非 JSON 错误响应，忽略 */
    }
    throw new ApiError(detail, resp.status);
  }

  // 204 / 空 body
  if (resp.status === 204) return undefined as T;
  const ct = resp.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return (await resp.text()) as unknown as T;
  }
  return (await resp.json()) as T;
}

/** GET 请求。 */
export function apiGet<T = unknown>(path: string, opts?: FetchOptions) {
  return apiFetch<T>(path, { ...opts, method: "GET" });
}

/** POST 请求。 */
export function apiPost<T = unknown>(
  path: string,
  body?: unknown,
  opts?: FetchOptions,
) {
  return apiFetch<T>(path, { ...opts, method: "POST", body: body as BodyInit });
}

/** 读取鉴权 token（用于 SSE 等无法走 apiFetch 的场景）。 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.token);
  } catch {
    return null;
  }
}
