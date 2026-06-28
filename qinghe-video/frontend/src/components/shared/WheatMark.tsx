import { cn } from "@/lib/utils";

interface WheatMarkProps {
  size?: number;
  className?: string;
  /** 标记是否为装饰性图标，默认 true（屏幕阅读器跳过）。 */
  decorative?: boolean;
}

/**
 * 青禾映画品牌 mark —— 麦穗 + 茎。
 * 抽离自旧 index.html L294-L316 的 SVG。
 */
export function WheatMark({ size = 32, className, decorative = true }: WheatMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-primary", className)}
      aria-hidden={decorative}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "青禾映画"}
    >
      <path
        d="M16 4C16 4 8 8 8 16C8 20 11 24 16 24C21 24 24 20 24 16C24 8 16 4 16 4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 24V28M12 14L16 18L20 14M12 18L16 22L20 18"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 完整麦穗插画（用于 Hero 区装饰，对应旧 index.html L295-L316）。 */
export function WheatStalk({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-primary", className)}
      aria-hidden="true"
    >
      {/* 主茎 */}
      <path d="M100 240V40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* 麦穗颗粒（左右对称） */}
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M100 60C92 56 84 58 80 64C84 70 92 68 100 64" />
        <path d="M100 60C108 56 116 58 120 64C116 70 108 68 100 64" />
        <path d="M100 80C92 76 84 78 80 84C84 90 92 88 100 84" />
        <path d="M100 80C108 76 116 78 120 84C116 90 108 88 100 84" />
        <path d="M100 100C92 96 84 98 80 104C84 110 92 108 100 104" />
        <path d="M100 100C108 96 116 98 120 104C116 110 108 108 100 104" />
        <path d="M100 120C92 116 84 118 80 124C84 130 92 128 100 124" />
        <path d="M100 120C108 116 116 118 120 124C116 130 108 128 100 124" />
        <path d="M100 140C92 136 84 138 80 144C84 150 92 148 100 144" />
        <path d="M100 140C108 136 116 138 120 144C116 150 108 148 100 144" />
      </g>
      {/* 顶部尖芒 */}
      <path
        d="M100 40L96 28M100 40L104 28M100 40L100 24"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* 叶片 */}
      <path
        d="M100 180C88 172 76 174 70 184C76 194 88 192 100 184"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M100 180C112 172 124 174 130 184C124 194 112 192 100 184"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}
