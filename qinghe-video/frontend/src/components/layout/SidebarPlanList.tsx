import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { usePlans } from "@/hooks/use-plans";
import { ROUTES } from "@/lib/constants";
import { truncate, formatDate, cn } from "@/lib/utils";

/**
 * 侧边栏方案历史列表。
 * - 从 usePlans() 读取 LocalStorage 数据
 * - 点击跳转 /chat?planId=xxx
 * - 折叠状态下只显示首字图标
 */
export function SidebarPlanList({ collapsed }: { collapsed: boolean }) {
  const { plans } = usePlans();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeId = searchParams.get("planId");

  function handleClick(id: string) {
    navigate(`${ROUTES.chat}?planId=${encodeURIComponent(id)}`);
  }

  return (
    <nav
      className="flex min-h-0 flex-1 flex-col px-3 pb-3"
      aria-label="我的方案"
    >
      {!collapsed && (
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          我的方案
        </h3>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {plans.length === 0 ? (
          !collapsed && (
            <p className="px-1 py-2 text-xs text-ink-faint">暂无方案</p>
          )
        ) : (
          <ul className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {plans.map((plan) => {
                const isActive = plan.id === activeId;
                const iconText = plan.title.charAt(0) || "#";
                return (
                  <motion.li
                    key={plan.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      type="button"
                      onClick={() => handleClick(plan.id)}
                      title={collapsed ? plan.title : undefined}
                      aria-label={`打开方案：${plan.title}（${formatDate(plan.updatedAt)}）`}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-all",
                        "hover:bg-secondary hover:scale-[1.01] active:scale-[0.99]",
                        isActive ? "bg-primary/10 text-primary" : "text-ink-soft",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-medium",
                          isActive ? "bg-primary/15 text-primary" : "bg-secondary text-ink-soft",
                        )}
                        aria-hidden="true"
                      >
                        {iconText}
                      </span>
                      {!collapsed && (
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xs font-medium">
                            {truncate(plan.title, 18)}
                          </span>
                          <span className="font-mono text-[10px] text-ink-faint">
                            {formatDate(plan.updatedAt)}
                          </span>
                        </span>
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {!collapsed && (
        <a
          href={`#${ROUTES.plan}`}
          className="mt-2 block rounded-md px-2 py-1.5 text-xs text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
        >
          查看全部 →
        </a>
      )}
    </nav>
  );
}
