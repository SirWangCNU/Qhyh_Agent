import { Link } from "react-router-dom";
import { Logo } from "@/components/shared/Logo";
import { ROUTES } from "@/lib/constants";

/**
 * 页脚：简洁的底部信息条。
 *
 * 视觉上尽量轻量，不抢占对话创作区的主体注意力：
 * 一行品牌、描述、快捷链接，底部一行版权。
 */
export function Footer() {
  const links = [
    { to: ROUTES.create, label: "开始创作" },
    { to: ROUTES.workshop, label: "分步工坊" },
    { to: ROUTES.plan, label: "规划设计" },
  ];

  return (
    <footer
      id="about"
      className="border-t border-border bg-background/50 backdrop-blur-sm"
      role="contentinfo"
    >
      <div className="container-app py-8">
        <div className="flex flex-col items-center justify-between gap-5 md:flex-row">
          <div className="flex items-center gap-2.5">
            <Logo asLink={false} size={22} />
            <span className="font-display text-sm font-semibold text-ink">
              青禾映画
            </span>
          </div>

          <p className="max-w-xs text-center text-xs leading-relaxed text-ink-faint md:text-left">
            面向农户与农业合作社的短视频智能创作平台，多 Agent 协同，一键生成完整方案。
          </p>

          <nav
            aria-label="页脚导航"
            className="flex flex-wrap items-center justify-center gap-4 text-xs text-ink-soft"
          >
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="transition-colors hover:text-brand"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-6 border-t border-border pt-4 text-center text-[11px] text-ink-faint/80">
          青禾映画 MVP · 农业短视频智能创作平台
        </div>
      </div>
    </footer>
  );
}
