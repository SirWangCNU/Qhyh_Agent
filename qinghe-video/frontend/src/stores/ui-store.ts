import { create } from "zustand";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * UI 全局状态：侧边栏显隐/折叠、当前路由。
 * - 侧边栏默认隐藏，点击顶部品牌 trigger 后展开
 * - 折叠状态持久化到 localStorage，与旧版 sidebar.js 行为一致
 */

interface UIState {
  sidebarCollapsed: boolean;
  sidebarVisible: boolean;
  activeRoute: string;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (v: boolean) => void;
  toggleSidebarVisible: () => void;
  setActiveRoute: (r: string) => void;
  hydrate: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: true, // 默认折叠
  sidebarVisible: false, // 默认隐藏，点击品牌 trigger 后展开
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

  setSidebarVisible: (v) => set({ sidebarVisible: v }),

  toggleSidebarVisible: () => {
    const { sidebarVisible } = get();
    if (sidebarVisible) {
      set({ sidebarVisible: false });
    } else {
      // 显示时默认展开
      get().setSidebarCollapsed(false);
      set({ sidebarVisible: true });
    }
  },

  setActiveRoute: (r) => set({ activeRoute: r }),

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.sidebarCollapsed);
      // 旧版逻辑：默认折叠，仅当显式存 "false" 时才展开
      const collapsed = raw !== "false";
      set({ sidebarCollapsed: collapsed, sidebarVisible: false });
    } catch {
      /* ignore，保持默认隐藏 */
    }
  },
}));
