import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function SidebarHeader({ collapsed, onToggle }: SidebarHeaderProps) {
  return (
    <div className="flex h-10 items-center justify-center px-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "展开边栏" : "收起边栏"}
        title={collapsed ? "展开边栏" : "收起边栏"}
        aria-expanded={!collapsed}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full text-ink-faint transition-colors",
          "hover:bg-[#ede6d3] hover:text-ink-soft",
        )}
      >
        <motion.span
          animate={{ opacity: collapsed ? 1 : 0.8 }}
          transition={{ duration: 0.15 }}
          aria-hidden="true"
        >
          <Menu size={16} />
        </motion.span>
      </button>
    </div>
  );
}
