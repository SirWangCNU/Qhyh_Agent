import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Trash2 } from "lucide-react";
import { useWorkshopSessions, useDeleteWorkshopSession } from "@/hooks/use-workshop-sessions";
import { ROUTES } from "@/lib/constants";
import { truncate, formatDate, cn } from "@/lib/utils";

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
    if (id === activeId) {
      navigate(ROUTES.workshop);
    }
  }

  return (
    <nav
      className="flex min-h-0 max-h-[45vh] shrink-0 flex-col border-t border-border/40 px-3 pt-3 pb-3"
      aria-label="工坊记录"
    >
      {!collapsed && (
        <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-[0.12em] text-ink-faint">
          <span className="h-1 w-1 rounded-full bg-[#c9a961]/60" />
          工坊记录
        </h3>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          !collapsed && (
            <p className="px-1 py-2 text-[11px] text-ink-faint">加载中...</p>
          )
        ) : sessions.length === 0 ? (
          !collapsed && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Sparkles size={20} className="text-ink-faint/60" />
              <p className="text-[12px] text-ink-faint">还没有工坊记录，开始创作吧</p>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
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
                        "relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all",
                        "hover:bg-brand/5",
                        isActive ? "bg-brand/8 text-ink" : "text-ink-soft",
                        collapsed && "h-9 w-9 justify-center px-0",
                      )}
                    >
                      {isActive && !collapsed && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                      )}
                      <span
                        className={cn(
                          "grid shrink-0 place-items-center rounded-full font-medium",
                          collapsed ? "h-9 w-9 text-[14px]" : "h-8 w-8 text-[13px]",
                          isActive ? "bg-brand text-white shadow-sm" : "bg-[#e8d9b0] text-ink-soft",
                        )}
                        aria-hidden="true"
                      >
                        {iconText}
                      </span>
                      {!collapsed && (
                        <span className="flex min-w-0 flex-1 flex-col pr-6">
                          <span className="truncate text-[13px] font-normal">
                            {truncate(session.name, 18)}
                          </span>
                          <span className="text-[11px] text-ink-faint">
                            {formatDate(session.updated_at)} · {session.step_progress}
                          </span>
                        </span>
                      )}
                    </button>
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, session.id)}
                        disabled={deleteSession.isPending}
                        title="删除工坊记录"
                        aria-label={`删除工坊：${session.name}`}
                        className={cn(
                          "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint opacity-0 transition-all",
                          "hover:bg-red-50 hover:text-red-500",
                          "group-hover:opacity-100 focus:opacity-100",
                        )}
                      >
                        <Trash2 size={13} />
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
