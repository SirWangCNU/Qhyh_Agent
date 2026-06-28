import { useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

/**
 * 侧边栏交互 hook：
 * - 暴露折叠状态与切换/设置函数
 * - 展开时监听 document click，点击外部自动折叠（与旧版 sidebar.js 一致）
 * - 展开时按 Esc 自动折叠
 *
 * 注意：调用方需在 sidebar 与 brand trigger 上加 `data-sidebar` / `data-brand-trigger` 属性，
 * 以便点击外部检测能正确排除这些元素。
 */
export function useSidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const setCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  // 点击外部关闭
  useEffect(() => {
    if (collapsed) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-sidebar]") || t.closest("[data-brand-trigger]")) return;
      setCollapsed(true);
    }
    // 用 setTimeout 延迟一帧，避免触发 toggle 的同一 click 立即关闭
    const timer = setTimeout(() => {
      document.addEventListener("click", onDocClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onDocClick);
    };
  }, [collapsed, setCollapsed]);

  // Esc 关闭
  useEffect(() => {
    if (collapsed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCollapsed(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);

  return { collapsed, toggle, setCollapsed };
}
