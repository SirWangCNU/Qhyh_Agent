import { Reveal } from "@/components/shared/Reveal";

/** 通用页面占位：eyebrow + 标题 + 描述 + TODO 卡片。 */
export interface PagePlaceholderProps {
  num: string;
  eyebrow: string;
  title: string;
  desc: string;
  todo?: string;
}

export function PagePlaceholder({ num, eyebrow, title, desc, todo }: PagePlaceholderProps) {
  return (
    <section className="container-app py-12">
      <Reveal>
        <div className="module__head">
          <span className="eyebrow">
            <span className="num">{num}</span>
            {eyebrow}
          </span>
          <h2 className="section-title">{title}</h2>
          <p className="section-desc">{desc}</p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-ink-soft">
            {todo ?? "此页面正在迁移中，敬请期待。"}
          </p>
        </div>
      </Reveal>
    </section>
  );
}
