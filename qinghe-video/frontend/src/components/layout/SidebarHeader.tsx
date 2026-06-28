import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * 侧边栏头部：仅包含折叠/展开按钮。
 * 品牌触发器在顶部 Header 中（更符合视觉层级）。
 */
export function SidebarHeader({ collapsed, onToggle }: SidebarHeaderProps) {
  return (
    <div className="flex h-12 items-center justify-center px-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "展开边栏" : "收起边栏"}
        title={collapsed ? "展开边栏" : "收起边栏"}
        aria-expanded={!collapsed}
        className={cn(
          "grid h-10 w-10 place-items-center rounded-md text-ink-soft transition-all",
          "hover:bg-secondary hover:text-ink hover:scale-105 active:scale-95",
        )}
      >
        <motion.span
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.2 }}
          aria-hidden="true"
        >
          <Menu size={18} />
        </motion.span>
      </button>
    </div>
  );
}
