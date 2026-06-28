import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/shared/Reveal";
import { cn } from "@/lib/utils";

/** 作品展示数据（移植自旧 chat.js SHOWCASE_WORKS）。 */
export interface ShowcaseWork {
  title: string;
  desc: string;
  platform: string;
  duration: string;
  prompt: string;
}

export const SHOWCASE_WORKS: ShowcaseWork[] = [
  {
    title: "安岳柠檬 · 产地溯源",
    desc: "30 秒抖音短视频，突出黄金产区与手工采摘。",
    platform: "抖音",
    duration: "30s",
    prompt: "cinematic close-up of fresh yellow lemons on a wooden basket in a sunlit citrus orchard, warm morning light, shallow depth of field, realistic photography, no text",
  },
  {
    title: "五常大米 · 品牌故事",
    desc: "60 秒快手口播脚本，讲述黑土种植到餐桌的旅程。",
    platform: "快手",
    duration: "60s",
    prompt: "aerial view of golden rice paddies in Northeast China, a farmer walking through the field with a straw hat, soft sunset light, cinematic realistic photography, no text",
  },
  {
    title: "西湖龙井 · 春茶上市",
    desc: "45 秒视频号产地溯源，展现清明前采茶与炒制。",
    platform: "视频号",
    duration: "45s",
    prompt: "close-up of fresh green tea leaves being picked by hand in a misty Longjing tea garden, spring morning dew, realistic photography, no text",
  },
  {
    title: "赣南脐橙 · 果园直发",
    desc: "30 秒抖音带货脚本，强调现摘现发与甜度保证。",
    platform: "抖音",
    duration: "30s",
    prompt: "ripe orange fruits hanging on trees in an orchard, farmer carrying a basket, golden hour sunlight, realistic photography, no text",
  },
  {
    title: "阳澄湖大闸蟹 · 金秋尝鲜",
    desc: "45 秒抖音短视频，聚焦蟹肥膏满与生态养殖。",
    platform: "抖音",
    duration: "45s",
    prompt: "fresh hairy crabs on a wooden tray with steam, golden autumn light, shallow depth of field, realistic food photography, no text",
  },
  {
    title: "新疆哈密瓜 · 沙漠绿洲",
    desc: "30 秒快手产地直发，突出昼夜温差与甘甜多汁。",
    platform: "快手",
    duration: "30s",
    prompt: "sweet melons in a desert oasis farm, farmer cutting a ripe melon, warm sunlight, realistic photography, no text",
  },
  {
    title: "云南普洱 · 古树茶韵",
    desc: "60 秒视频号品牌故事，呈现古茶树与手工制茶。",
    platform: "视频号",
    duration: "60s",
    prompt: "ancient tea trees in Yunnan misty mountains, hands rolling tea leaves traditionally, cinematic realistic photography, no text",
  },
  {
    title: "东北黑木耳 · 山林珍味",
    desc: "30 秒抖音带货脚本，强调椴木生长与原生态品质。",
    platform: "抖音",
    duration: "30s",
    prompt: "black wood ear mushrooms growing on logs in a Northeast China forest, soft natural light, realistic photography, no text",
  },
  {
    title: "海南芒果 · 热带阳光",
    desc: "45 秒快手短视频，展现热带果园与现摘现发。",
    platform: "快手",
    duration: "45s",
    prompt: "ripe mangoes hanging on tropical trees, farmer picking mangoes in a sunny Hainan orchard, realistic photography, no text",
  },
];

/** 用 AI 图像 API 生成缩略图（遵循 Image Guidelines）。 */
function showcaseImgUrl(prompt: string) {
  return `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=landscape_16_9`;
}

interface ShowcaseSectionProps {
  className?: string;
}

/**
 * 作品展示区域：9 张农产品短视频案例卡片网格。
 * - 点击卡片 → 跳转到 /chat?work=xxx 并预填参考提示
 * - 卡片进入使用 Framer Motion 淡入升起效果
 * - 图片加载用 Skeleton 占位 + onLoad 淡入
 */
export function ShowcaseSection({ className }: ShowcaseSectionProps) {
  const navigate = useNavigate();

  function handleClick(w: ShowcaseWork) {
    const seedText = `参考「${w.title}」的风格，${w.desc}`;
    navigate(`/chat?seed=${encodeURIComponent(seedText)}`);
  }

  return (
    <section className={cn("container-app py-12", className)}>
      <Reveal>
        <div className="module__head">
          <span className="eyebrow">
            <span className="num">02</span>
            作品展示
          </span>
          <h2 className="section-title">精选农产品短视频案例</h2>
          <p className="section-desc">参考优秀案例风格，点击卡片即可进入对话创作。</p>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SHOWCASE_WORKS.map((w, idx) => (
          <ShowcaseCard
            key={w.title}
            work={w}
            index={idx}
            onClick={() => handleClick(w)}
          />
        ))}
      </div>
    </section>
  );
}

function ShowcaseCard({
  work,
  index,
  onClick,
}: {
  work: ShowcaseWork;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.4), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.01 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`参考案例：${work.title}（${work.platform} · ${work.duration}）`}
      className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/* 封面图 */}
      <div className="relative aspect-video overflow-hidden bg-muted/40">
        <img
          src={showcaseImgUrl(work.prompt)}
          alt={work.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            // 图片加载失败时显示渐变占位
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const parent = (e.currentTarget as HTMLImageElement).parentElement;
            if (parent) {
              parent.style.background =
                "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)/0.2) 100%)";
            }
          }}
        />
        {/* 悬停 play 按钮遮罩 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/30 group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-primary shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110">
            <Play size={20} fill="currentColor" />
          </span>
        </div>
        {/* 标签 */}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <Badge variant="secondary" className="bg-white/85 text-ink backdrop-blur-sm">
            {work.platform}
          </Badge>
          <Badge variant="outline" className="border-white/50 bg-black/30 text-white backdrop-blur-sm">
            {work.duration}
          </Badge>
        </div>
      </div>

      {/* 文字内容 */}
      <div className="p-4">
        <h3 className="font-display text-base font-semibold text-ink transition-colors group-hover:text-primary">
          {work.title}
        </h3>
        <p className="mt-1 text-sm text-ink-soft line-clamp-2">{work.desc}</p>
      </div>
    </motion.article>
  );
}
