import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { WheatMark } from "@/components/shared/WheatMark";
import { HealthPill } from "./HealthPill";
import { NAV_LINKS } from "@/lib/constants";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 顶部导航栏。
 * - 左侧：品牌 mark + 文字（点击展开/收起侧边栏）
 * - 中间：5 个 NavLink
 * - 右侧：后端健康状态 + 登出按钮
 */
export function Header() {
  const toggleSidebarVisible = useUIStore((s) => s.toggleSidebarVisible);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  return (
    <header
      className="sticky top-0 z-[100] border-b border-border bg-background/85 backdrop-blur-md"
      role="banner"
    >
      <div className="container-app flex h-16 items-center justify-between gap-4">
        {/* 左侧：品牌 trigger */}
        <button
          type="button"
          data-brand-trigger
          onClick={toggleSidebarVisible}
          aria-label="展开/收起边栏"
          className="inline-flex items-center gap-2 rounded-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <WheatMark size={28} />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            青禾映画
          </span>
        </button>

        {/* 中间：导航 */}
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="主导航"
        >
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-ink-soft hover:bg-secondary hover:text-ink",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* 右侧：健康状态 + 登出 */}
        <div className="flex items-center gap-3">
          <HealthPill />
          {isAuthenticated && (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-ink-soft sm:inline" aria-label="当前用户">
                {user?.username}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={logout}
                aria-label="登出"
                title="登出"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 移动端次级导航 */}
      <nav
        className="container-app flex items-center gap-1 overflow-x-auto pb-2 md:hidden"
        aria-label="移动端导航"
      >
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-ink-soft hover:bg-secondary",
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
