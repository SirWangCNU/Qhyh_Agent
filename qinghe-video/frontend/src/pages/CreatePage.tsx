import { Link } from "react-router-dom";
import { WheatStalk } from "@/components/shared/WheatMark";
import { Button } from "@/components/ui/button";
import { ShowcaseSection } from "@/components/home/ShowcaseSection";
import { ROUTES } from "@/lib/constants";

/**
 * 开始创作页（#/create）。
 * - Hero 区：品牌文案 + 麦穗插画
 * - 作品广场区：9 张农产品案例卡片（可点击跳转到对话创作）
 */
export function CreatePage() {
  return (
    <>
      {/* Hero 区 */}
      <section className="border-b border-border">
        <div className="container-app grid items-center gap-8 py-16 md:grid-cols-2">
          <div>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink md:text-5xl">
              让每一份农产品，
              <br />
              都有专属的<em className="not-italic text-primary">影像故事</em>。
            </h1>
            <p className="mt-4 max-w-prose text-ink-soft">
              青禾映画面向农户与农业合作社。输入农产品基本信息，五个 AI Agent 流水线协作，自动生成一套完整的短视频创作方案——从策划到投放，一站完成。
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["策划 · 文案 · 脚本", "视觉 · 投放 · 报告", "SSE 实时流式"].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-ink-soft"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link to={ROUTES.chat}>对话创作</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={ROUTES.workshop}>高级创作</Link>
              </Button>
            </div>
          </div>
          <div className="hidden justify-self-center md:flex" aria-hidden="true">
            <WheatStalk className="h-60 w-60 opacity-80" />
          </div>
        </div>
      </section>

      {/* 作品广场 */}
      <ShowcaseSection />
    </>
  );
}
