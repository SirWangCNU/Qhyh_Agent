/**
 * 精选作品卡片 + 数据。
 *
 * 从 ChatPage 提取，保持 ChatPage 聚焦对话逻辑。
 * 空状态底部展示 2 列大卡，点击后预填提示并发送。
 */

import { motion } from "framer-motion";

/** 精选作品数据（空状态底部展示）。 */
export const FEATURED_WORKS = [
  {
    title: "安岳柠檬 · 产地溯源",
    desc: "30 秒抖音短视频，突出黄金产区与手工采摘。",
    platform: "抖音",
    duration: "30s",
    prompt:
      "cinematic close-up of fresh yellow lemons on a wooden basket in a sunlit citrus orchard, warm morning light, shallow depth of field, realistic photography, no text",
  },
  {
    title: "五常大米 · 品牌故事",
    desc: "60 秒快手口播脚本，讲述黑土种植到餐桌的旅程。",
    platform: "快手",
    duration: "60s",
    prompt:
      "aerial view of golden rice paddies in Northeast China, a farmer walking through the field with a straw hat, soft sunset light, cinematic realistic photography, no text",
  },
  {
    title: "西湖龙井 · 春茶上市",
    desc: "45 秒视频号产地溯源，展现清明前采茶与炒制。",
    platform: "视频号",
    duration: "45s",
    prompt:
      "close-up of fresh green tea leaves being picked by hand in a misty Longjing tea garden, spring morning dew, realistic photography, no text",
  },
  {
    title: "赣南脐橙 · 果园直发",
    desc: "30 秒抖音带货脚本，强调现摘现发与甜度保证。",
    platform: "抖音",
    duration: "30s",
    prompt:
      "ripe orange fruits hanging on trees in an orchard, farmer carrying a basket, golden hour sunlight, realistic photography, no text",
  },
] as const;

/** 精选作品大卡。 */
export function FeaturedCard({
  work,
  index,
  onClick,
}: {
  work: (typeof FEATURED_WORKS)[number];
  index: number;
  onClick: (text: string) => void;
}) {
  const text = `参考「${work.title}」的风格，${work.desc}`;
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.08, duration: 0.45 }}
      whileHover={{ y: -4 }}
      onClick={() => onClick(text)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(text);
        }
      }}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
      aria-label={`参考案例：${work.title}（${work.platform} · ${work.duration}）`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted/40">
        <img
          src={`https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(work.prompt)}&image_size=landscape_16_9`}
          alt={work.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const parent = (e.currentTarget as HTMLImageElement).parentElement;
            if (parent) {
              parent.style.background =
                "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)/0.2) 100%)";
            }
          }}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-12">
          <h4 className="font-display text-base font-semibold text-white">
            {work.title}
          </h4>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              {work.platform}
            </span>
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
              {work.duration}
            </span>
          </div>
        </div>
      </div>
      <p className="p-3 text-xs text-ink-soft line-clamp-2">{work.desc}</p>
    </motion.article>
  );
}
