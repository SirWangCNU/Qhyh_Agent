import { create } from "zustand";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * UI 全局状态：侧边栏折叠、当前路由。
 * 折叠状态持久化到 localStorage，与旧版 sidebar.js 行为一致（默认折叠）。
 */

interface UIState {
  sidebarCollapsed: boolean;
  activeRoute: string;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setActiveRoute: (r: string) => void;
  hydrate: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: true, // 默认折叠
  activeRoute: "/create",

  setSidebarCollapsed: (v) => {
    try {
      localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, String(v));
    } catch {
      /* ignore */
    }
    set({ sidebarCollapsed: v });
  },

  toggleSidebar: () => {
    get().setSidebarCollapsed(!get().sidebarCollapsed);
  },

  setActiveRoute: (r) => set({ activeRoute: r }),

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.sidebarCollapsed);
      // 旧版逻辑：默认折叠，仅当显式存 "false" 时才展开
      const collapsed = raw !== "false";
      set({ sidebarCollapsed: collapsed });
    } catch {
      /* ignore，保持默认折叠 */
    }
  },
}));
