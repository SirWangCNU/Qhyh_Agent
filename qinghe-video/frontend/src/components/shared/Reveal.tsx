import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 延迟（秒）。 */
  delay?: number;
  /** 子元素。 */
  children: React.ReactNode;
}

const variants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

/**
 * 滚动入场动画包装。
 * 替代旧版的 `.reveal` CSS + IntersectionObserver class 切换。
 *
 * 用法：
 * ```tsx
 * <Reveal><Card>...</Card></Reveal>
 * ```
 */
export function Reveal({ delay = 0, className, children, ...rest }: RevealProps) {
  const { ref, isIn } = useReveal<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isIn ? "visible" : "hidden"}
      variants={variants}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(className)}
      {...(rest as React.ComponentProps<typeof motion.div>)}
    >
      {children}
    </motion.div>
  );
}
