import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { usePlans } from "@/hooks/use-plans";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface SidebarNewPlanProps {
  collapsed: boolean;
}

/** "新建方案" FAB 按钮。 */
export function SidebarNewPlan({ collapsed }: SidebarNewPlanProps) {
  const navigate = useNavigate();
  const { createPlan } = usePlans();

  function handleClick() {
    const plan = createPlan();
    navigate(`${ROUTES.chat}?planId=${encodeURIComponent(plan.id)}`);
  }

  return (
    <div className="px-3">
      <button
        type="button"
        onClick={handleClick}
        aria-label="新建方案"
        title="新建方案"
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-ink transition-all",
          "hover:border-primary hover:bg-primary/5 hover:text-primary hover:scale-[1.02] active:scale-[0.98]",
          collapsed && "justify-center px-0",
        )}
      >
        <Plus size={16} aria-hidden="true" />
        {!collapsed && <span>新建方案</span>}
      </button>
    </div>
  );
}
