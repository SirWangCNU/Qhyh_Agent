import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useWorkshopSessions, useDeleteWorkshopSession } from "@/hooks/use-workshop-sessions";
import { ROUTES } from "@/lib/constants";
import { truncate, formatDate, cn } from "@/lib/utils";

/**
 * 侧边栏工坊会话历史列表。
 * - 从 useWorkshopSessions() 读取后端数据
 * - 点击跳转 /workshop?sessionId=xxx
 * - 折叠状态下只显示首字图标
 * - 悬停显示删除按钮
 *
 * 与 SidebarPlanList（对话记录）完全独立，数据源不同：
 * - 对话记录：localStorage qinghe_plans（use-plans.ts）
 * - 工坊记录：后端 /api/workshop/sessions（use-workshop-sessions.ts）
 */
export function SidebarWorkshopList({ collapsed }: { collapsed: boolean }) {
  const { data: sessions = [], isLoading } = useWorkshopSessions();
  const deleteSession = useDeleteWorkshopSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeId = searchParams.get("sessionId");

  function handleClick(id: string) {
    navigate(`${ROUTES.workshop}?sessionId=${encodeURIComponent(id)}`);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("确定删除该工坊记录？此操作不可撤销。")) return;
    deleteSession.mutate(id);
    // 若删除的是当前会话，跳转到空白工坊
    if (id === activeId) {
      navigate(ROUTES.workshop);
    }
  }

  return (
    <nav
      className="flex min-h-0 max-h-[40vh] shrink-0 flex-col px-3 pb-3"
      aria-label="工坊记录"
    >
      {!collapsed && (
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          工坊记录
        </h3>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          !collapsed && (
            <p className="px-1 py-2 text-xs text-ink-faint">加载中...</p>
          )
        ) : sessions.length === 0 ? (
          !collapsed && (
            <p className="px-1 py-2 text-xs text-ink-faint">暂无工坊记录</p>
          )
        ) : (
          <ul className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {sessions.map((session) => {
                const isActive = session.id === activeId;
                const iconText = session.name.charAt(0) || "#";
                return (
                  <motion.li
                    key={session.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="group relative"
                  >
                    <button
                      type="button"
                      onClick={() => handleClick(session.id)}
                      title={collapsed ? session.name : undefined}
                      aria-label={`打开工坊：${session.name}（${formatDate(session.updated_at)}，进度 ${session.step_progress}）`}
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
                            {truncate(session.name, 18)}
                          </span>
                          <span className="font-mono text-[10px] text-ink-faint">
                            {formatDate(session.updated_at)} · {session.step_progress}
                          </span>
                        </span>
                      )}
                    </button>
                    {/* 删除按钮：悬停时显示 */}
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, session.id)}
                        disabled={deleteSession.isPending}
                        title="删除工坊记录"
                        aria-label={`删除工坊：${session.name}`}
                        className={cn(
                          "absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint opacity-0 transition-opacity",
                          "hover:bg-destructive/10 hover:text-destructive",
                          "group-hover:opacity-100 focus:opacity-100",
                        )}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </nav>
  );
}
