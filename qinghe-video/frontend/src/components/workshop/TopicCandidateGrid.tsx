import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TopicCandidate } from "@/types/api";

/**
 * 选题候选卡片网格：展示 AI 生成的多个爆款主题候选，供用户选定。
 *
 * 选定后由父组件触发回填与润写。独立成组件以控制 WorkshopStepCard 行数。
 */
export function TopicCandidateGrid({
  topics,
  selectedIndex,
  disabled,
  onSelect,
}: {
  topics: TopicCandidate[];
  selectedIndex: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-ink-soft">
          AI 生成 {topics.length} 个爆款候选，点击「采用」选定
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {topics.map((t, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col rounded-md border p-2 text-xs transition-colors",
              selectedIndex === i
                ? "border-primary bg-primary/5"
                : "border-border bg-background",
            )}
          >
            <div className="font-medium text-ink">{t.theme}</div>
            <div className="mt-1 text-ink-soft">
              <span className="text-ink-faint">角度：</span>
              {t.creative_angle}
            </div>
            <div className="text-ink-soft">
              <span className="text-ink-faint">钩子：</span>
              {t.traffic_hook}
            </div>
            <div className="text-ink-soft">
              <span className="text-ink-faint">痛点：</span>
              {t.pain_point}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[10px] text-ink-faint">{t.target_audience}</span>
              <Button
                size="sm"
                variant={selectedIndex === i ? "default" : "outline"}
                className="h-6 px-2 text-[11px]"
                disabled={disabled}
                onClick={() => onSelect(i)}
              >
                {selectedIndex === i ? "已采用" : "采用"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
