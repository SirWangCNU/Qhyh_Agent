import { motion } from "framer-motion";
import { useSidebar } from "@/hooks/use-sidebar";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarNewPlan } from "./SidebarNewPlan";
import { SidebarProgress } from "./SidebarProgress";
import { SidebarPlanList } from "./SidebarPlanList";
import { SidebarWorkshopList } from "./SidebarWorkshopList";

/**
 * 左侧可折叠边栏 —— 第一个关键组件。
 *
 * 职责：
 * 1. 折叠/展开切换（Framer Motion width 动画）
 * 2. 新建方案入口
 * 3. 当前生成任务的流水线进度展示
 * 4. 两个独立分组：
 *    - 对话记录（Plan）：localStorage，use-plans.ts
 *    - 工坊记录（Workshop Session）：后端 /api/workshop/sessions，use-workshop-sessions.ts
 *
 * 交互：
 * - 默认隐藏，点击顶部品牌 trigger 后展开
 * - 折叠状态持久化到 localStorage
 * - 展开时点击外部或按 Esc 自动折叠（useSidebar hook 处理）
 * - 完整 ARIA 属性
 */
export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const visible = useUIStore((s) => s.sidebarVisible);

  return (
    <motion.aside
      data-sidebar
      layout
      initial={false}
      animate={{ width: visible ? (collapsed ? 64 : 280) : 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "site-sidebar sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-border bg-bg-alt py-4",
        "overflow-hidden",
        !visible && "border-r-0",
      )}
      aria-label="方案边栏"
      aria-expanded={visible && !collapsed}
      aria-hidden={!visible}
    >
      <SidebarHeader collapsed={collapsed} onToggle={toggle} />
      <SidebarNewPlan collapsed={collapsed} />
      <SidebarProgress collapsed={collapsed} />
      {/* 对话记录分组：localStorage Plan[] */}
      <SidebarPlanList collapsed={collapsed} />
      {/* 工坊记录分组：后端 WorkshopSession[]，与对话记录完全独立 */}
      <SidebarWorkshopList collapsed={collapsed} />
    </motion.aside>
  );
}
