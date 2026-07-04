/**
 * 登出 hook：协调 auth-store.logout + 路由跳转。
 *
 * 为什么需要：
 * - auth-store.logout 不应感知路由（store 与路由解耦）
 * - 登出后需 navigate('/create', { replace: true }) 清除 URL 参数
 *   ?sessionId=xxx / ?conversationId=xxx，防止新用户登录后回到这些 URL 触发跨用户请求
 *
 * auth-store.logout 内部已调 clearAllUserData()（清 workshop/canvas/pipeline
 * store + sessionStorage + react-query 缓存），本 hook 只补充路由跳转。
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";

export function useLogout() {
  const navigate = useNavigate();
  return useCallback(() => {
    useAuthStore.getState().logout();
    // 跳转到 /create 并替换历史记录，清除 ?sessionId/?conversationId 等参数
    navigate("/create", { replace: true });
  }, [navigate]);
}
