import { Link } from "react-router-dom";
import { Logo } from "@/components/shared/Logo";
import { ROUTES } from "@/lib/constants";

/**
 * 页脚：三栏 grid + 底部版权行。
 * 复刻旧 index.html L572-L613 的结构。
 */
export function Footer() {
  return (
    <footer
      id="about"
      className="mt-16 border-t border-border bg-background/60"
      role="contentinfo"
    >
      <div className="container-app py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {/* 品牌列 */}
          <div>
            <Logo asLink={false} size={28} />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
              面向农户和农业合作社的多 Agent 协同短视频智能创作平台。用户只需输入农产品基本信息，系统通过五个 AI Agent 流水线协作，自动生成一套完整的短视频创作方案。
            </p>
          </div>

          {/* 分步工坊列 */}
          <nav aria-label="分步工坊">
            <h4 className="font-display text-sm font-semibold text-ink">分步工坊</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {["策划 Agent", "文案 Agent", "脚本 Agent", "视觉 Agent", "投放 Agent"].map((label) => (
                <li key={label}>
                  <Link
                    to={ROUTES.workshop}
                    className="transition-colors hover:text-primary"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* 说明列 */}
          <nav aria-label="说明">
            <h4 className="font-display text-sm font-semibold text-ink">说明</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li>
                <Link to={ROUTES.create} className="transition-colors hover:text-primary">
                  开始创作
                </Link>
              </li>
              <li>
                <Link to={ROUTES.agents} className="transition-colors hover:text-primary">
                  Agent 管理
                </Link>
              </li>
              <li>
                <Link to={ROUTES.plan} className="transition-colors hover:text-primary">
                  规划设计
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-border pt-4 text-xs text-ink-faint sm:flex-row sm:items-center">
          <span>青禾映画 MVP · 农业短视频智能创作平台</span>
        </div>
      </div>
    </footer>
  );
}
