import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Trash2 } from "lucide-react";
import { useConversationSessions, useDeleteConversation } from "@/hooks/use-conversation-sessions";
import { ROUTES } from "@/lib/constants";
import { truncate, formatDate, cn } from "@/lib/utils";

export function SidebarPlanList({ collapsed }: { collapsed: boolean }) {
  const { data, isLoading } = useConversationSessions();
  const sessions = data?.items ?? [];
  const deleteConversation = useDeleteConversation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeId = searchParams.get("conversationId");

  function handleClick(id: string) {
    navigate(`${ROUTES.chat}?conversationId=${encodeURIComponent(id)}`);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("确定删除该对话？此操作不可撤销。")) return;
    deleteConversation.mutate(id);
    if (id === activeId) {
      navigate(ROUTES.chat);
    }
  }

  return (
    <nav
      className="flex min-h-0 flex-1 flex-col px-3 pb-2"
      aria-label="对话历史"
    >
      {!collapsed && (
        <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-[0.12em] text-ink-faint">
          <span className="h-1 w-1 rounded-full bg-brand/40" />
          对话历史
        </h3>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && !collapsed && (
          <p className="px-1 py-2 text-[11px] text-ink-faint">加载中…</p>
        )}
        {!isLoading && sessions.length === 0 ? (
          !collapsed && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <MessageCircle size={20} className="text-ink-faint/60" />
              <p className="text-[12px] text-ink-faint">还没有对话，开始创作吧</p>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
            <AnimatePresence initial={false}>
              {sessions.map((session) => {
                const isActive = session.id === activeId;
                const iconText = session.title.charAt(0) || "#";
                const updatedAt = new Date(session.updated_at).getTime();
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
                      title={collapsed ? session.title : undefined}
                      aria-label={`打开对话：${session.title}（${formatDate(updatedAt)}）`}
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
                          isActive ? "bg-brand text-white shadow-sm" : "bg-[#ede6d3] text-ink-soft",
                        )}
                        aria-hidden="true"
                      >
                        {iconText}
                      </span>
                      {!collapsed && (
                        <span className="flex min-w-0 flex-1 flex-col pr-6">
                          <span className="truncate text-[13px] font-normal">
                            {truncate(session.title, 18)}
                          </span>
                          <span className="text-[11px] text-ink-faint">
                            {formatDate(updatedAt)}
                          </span>
                        </span>
                      )}
                    </button>
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, session.id)}
                        disabled={deleteConversation.isPending}
                        title="删除对话"
                        aria-label={`删除对话：${session.title}`}
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
