import { QueryClient } from "@tanstack/react-query";

/**
 * 全局 react-query QueryClient 单例。
 *
 * 提取为模块单例而非 App.tsx 局部变量，使 auth-store 等非组件代码
 * 也能在登录成功后 invalidateQueries（触发侧边栏列表重新拉取）。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});
