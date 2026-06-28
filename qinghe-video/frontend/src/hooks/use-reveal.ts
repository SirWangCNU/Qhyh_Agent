import { useEffect, useRef, useState } from "react";

/**
 * 滚动入场 hook：当元素进入视口时把 state 切到 true，触发 CSS / Framer Motion 动画。
 *
 * 用法：
 * ```tsx
 * const { ref, isIn } = useReveal<HTMLDivElement>();
 * return <div ref={ref} className={cn("reveal", isIn && "is-in")} />;
 * ```
 *
 * 内部使用 IntersectionObserver，无此 API 时回退为立刻可见。
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const { threshold = 0.12, rootMargin = "0px 0px -40px 0px", once = true } = options ?? {};
  const ref = useRef<T | null>(null);
  const [isIn, setIsIn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setIsIn(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsIn(true);
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            setIsIn(false);
          }
        });
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, isIn };
}
