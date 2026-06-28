import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthResponse } from "@/types/api";
import { z } from "zod";

/** 登录表单 Zod 校验。 */
export const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

/** 注册表单 Zod 校验。 */
export const registerSchema = z.object({
  username: z.string().min(3, "用户名至少 3 个字符"),
  password: z.string().min(6, "密码至少 6 个字符"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

async function postAuth(path: "/api/auth/login" | "/api/auth/register", body: LoginInput) {
  return apiPost<AuthResponse>(path, body, { skipAuth: true });
}

/** 登录 mutation。成功后写入 auth-store。 */
export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (input: LoginInput) => postAuth("/api/auth/login", input),
    onSuccess: (data) => {
      setAuth(data.access_token, { username: data.username, role: data.role });
    },
  });
}

/** 注册 mutation。注册成功后自动登录。 */
export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      await apiPost("/api/auth/register", input, { skipAuth: true });
      return postAuth("/api/auth/login", input);
    },
    onSuccess: (data) => {
      setAuth(data.access_token, { username: data.username, role: data.role });
    },
  });
}

/** 把 mutation error 转成可读字符串。 */
export function formatAuthError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "未知错误";
}
