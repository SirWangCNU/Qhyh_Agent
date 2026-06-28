import { Link } from "react-router-dom";
import { WheatMark } from "./WheatMark";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** 点击是否跳转到首页。 */
  asLink?: boolean;
  className?: string;
  size?: number;
  /** 自定义文字（默认"青禾映画"）。 */
  text?: string;
}

/** 品牌 logo = WheatMark + 文字。 */
export function Logo({ asLink = true, className, size = 28, text = "青禾映画" }: LogoProps) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <WheatMark size={size} />
      <span className="font-display text-lg font-semibold tracking-tight text-ink">
        {text}
      </span>
    </span>
  );
  if (!asLink) return inner;
  return (
    <Link to={ROUTES.create} className="inline-flex items-center transition-opacity hover:opacity-80">
      {inner}
    </Link>
  );
}
