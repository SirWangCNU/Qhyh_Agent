import { motion } from "framer-motion";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarNewPlan } from "./SidebarNewPlan";
import { SidebarProgress } from "./SidebarProgress";
import { SidebarPlanList } from "./SidebarPlanList";

/**
 * 左侧可折叠边栏 —— 第一个关键组件。
 *
 * 职责：
 * 1. 折叠/展开切换（Framer Motion width 动画）
 * 2. 新建方案入口
 * 3. 当前生成任务的流水线进度展示
 * 4. 方案历史列表
 *
 * 交互：
 * - 折叠状态持久化到 localStorage
 * - 展开时点击外部或按 Esc 自动折叠（useSidebar hook 处理）
 * - 完整 ARIA 属性
 */
export function Sidebar() {
  const { collapsed, toggle } = useSidebar();

  return (
    <motion.aside
      data-sidebar
      layout
      initial={false}
      animate={{ width: collapsed ? 64 : 280 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "site-sidebar sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-border bg-bg-alt py-4",
        "overflow-hidden",
      )}
      aria-label="方案边栏"
      aria-expanded={!collapsed}
    >
      <SidebarHeader collapsed={collapsed} onToggle={toggle} />
      <SidebarNewPlan collapsed={collapsed} />
      <SidebarProgress collapsed={collapsed} />
      <SidebarPlanList collapsed={collapsed} />
    </motion.aside>
  );
}
