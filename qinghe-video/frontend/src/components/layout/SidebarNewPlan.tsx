import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface SidebarNewPlanProps {
  collapsed: boolean;
}

export function SidebarNewPlan({ collapsed }: SidebarNewPlanProps) {
  const navigate = useNavigate();

  function handleClick() {
    navigate(ROUTES.chat);
  }

  return (
    <div className="px-3 py-2">
      <button
        type="button"
        onClick={handleClick}
        aria-label="新建对话"
        title="新建对话"
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-brand/20 bg-white/70 px-3 py-2.5 text-sm font-normal text-ink-soft transition-colors",
          "hover:border-brand/40 hover:bg-brand/10 hover:text-brand",
          collapsed && "h-9 w-9 justify-center rounded-full px-0",
        )}
      >
        <Plus size={16} aria-hidden="true" />
        {!collapsed && <span>新建对话</span>}
      </button>
    </div>
  );
}
