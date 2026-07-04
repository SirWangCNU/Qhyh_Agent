import { create } from "zustand";
import { STORAGE_KEYS } from "@/lib/constants";
import { queryClient } from "@/lib/queryClient";

/**
 * 鉴权状态。
 * - token / user 持久化到 localStorage（与旧 HTML 版本同名键，便于书签/会话延续）
 * - hydrate() 在应用启动时从 localStorage 恢复（main.tsx 渲染前同步调用）
 * - setAuth 后 invalidate 历史记录查询，确保登录后侧边栏立即加载
 */

export interface AuthUser {
  username: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) => {
    try {
      localStorage.setItem(STORAGE_KEYS.token, token);
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    } catch {
      /* localStorage 不可用时静默忽略 */
    }
    set({ token, user, isAuthenticated: true });
    // 登录成功后刷新所有历史记录列表（工坊会话 + 对话会话）
    queryClient.invalidateQueries({ queryKey: ["workshop", "sessions"] });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  },

  logout: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.token);
      localStorage.removeItem(STORAGE_KEYS.user);
    } catch {
      /* ignore */
    }
    set({ token: null, user: null, isAuthenticated: false });
  },

  hydrate: () => {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.token);
      const rawUser = localStorage.getItem(STORAGE_KEYS.user);
      if (token && rawUser) {
        const user = JSON.parse(rawUser) as AuthUser;
        set({ token, user, isAuthenticated: true });
      }
    } catch {
      /* 损坏的 localStorage 数据视为未登录 */
    }
  },
}));
