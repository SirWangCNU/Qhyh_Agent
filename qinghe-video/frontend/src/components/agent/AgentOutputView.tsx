import * as React from "react";
import { LayoutGrid, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/hooks/use-agents";
import { useExportStoryboardToCanvas } from "@/components/canvas/hooks/useExportStoryboardToCanvas";
import type {
  PlannerOutput,
  CopywriterOutput,
  ScriptwriterOutput,
  StorySegment,
  Shot,
  VisualOutput,
  DistributorOutput,
} from "@/types/api";
import type { NodeKey } from "@/lib/constants";

interface AgentOutputViewProps {
  step: NodeKey;
  output: unknown;
  className?: string;
}

/**
 * Agent 结构化输出渲染器。
 * 根据 step 路由到对应 Agent 的渲染子组件；report_generator 走 Markdown。
 */
export function AgentOutputView({ step, output, className }: AgentOutputViewProps) {
  if (!output || typeof output !== "object") {
    return <p className="text-sm text-ink-faint">暂无输出</p>;
  }

  return (
    <div className={cn("agent-output space-y-3 text-sm", className)}>
      {step === "planner" && <PlannerView output={output as PlannerOutput} />}
      {step === "copywriter" && <CopywriterView output={output as CopywriterOutput} />}
      {step === "scriptwriter" && <ScriptwriterView output={output as ScriptwriterOutput} />}
      {step === "visual_designer" && <VisualView output={output as VisualOutput} />}
      {step === "distributor" && <DistributorView output={output as DistributorOutput} />}
      {step === "report_generator" && (
        <article
          className="prose prose-sm max-w-none whitespace-pre-wrap text-ink"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(String(output)) }}
        />
      )}
    </div>
  );
}

// ============================================================
// 各 Agent 渲染子组件
// ============================================================

function PlannerView({ output }: { output: PlannerOutput }) {
  return (
    <div className="space-y-2">
      <Field label="视频主题">{output.theme}</Field>
      <Field label="视频类型">
        <Badge variant="secondary">{output.video_type}</Badge>
      </Field>
      <Field label="情绪基调">
        <Badge variant="outline">{output.emotion_tone}</Badge>
      </Field>
      <Field label="创意切入点">{output.creative_angle}</Field>
      <Field label="核心卖点">
        <ul className="ml-4 list-disc space-y-0.5">
          {output.core_selling_points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Field>
      <Field label="目标受众">
        <div className="text-xs text-ink-soft">
          {output.target_audience.age_range} · {output.target_audience.region}
          <br />
          {output.target_audience.consumer_profile}
        </div>
      </Field>
      {output.strategy_notes && (
        <Field label="策略备注">
          <p className="text-xs text-ink-soft">{output.strategy_notes}</p>
        </Field>
      )}
    </div>
  );
}

function CopywriterView({ output }: { output: CopywriterOutput }) {
  return (
    <div className="space-y-2">
      <Field label="Hook（开场）">
        <p className="rounded-md bg-secondary/50 p-2">{output.hook.text}</p>
        <p className="mt-1 text-xs text-ink-faint">语气：{output.hook.delivery_note}</p>
      </Field>
      <Field label="主体段落">
        <ol className="ml-4 list-decimal space-y-1">
          {output.body.map((seg) => (
            <li key={seg.segment}>
              <p>{seg.text}</p>
              <p className="text-xs text-ink-faint">语气：{seg.delivery_note}</p>
            </li>
          ))}
        </ol>
      </Field>
      <Field label="CTA（行动召唤）">
        <p className="rounded-md bg-accent/10 p-2">{output.cta.text}</p>
      </Field>
      <Field label="完整口播稿">
        <pre className="whitespace-pre-wrap rounded-md bg-secondary/30 p-2 text-xs">
          {output.full_script}
        </pre>
      </Field>
      <div className="flex gap-4 text-xs text-ink-faint">
        <span>预计时长：{output.estimated_duration_seconds}s</span>
        <span>字数：{output.word_count}</span>
      </div>
    </div>
  );
}

function ScriptwriterView({ output }: { output: ScriptwriterOutput }) {
  const hasSegments = !!output.segments?.length;
  return (
    <div className="space-y-2">
      <Field label="脚本标题">{output.title}</Field>
      <div className="flex gap-4 text-xs text-ink-faint">
        <span>总时长：{output.total_duration_seconds}s</span>
        <span>片段数：{output.segments?.length ?? 0}</span>
        <span>分镜数：{output.shots.length}</span>
      </div>
      <Field label="BGM 建议">
        <div className="text-xs text-ink-soft">
          {output.bgm_suggestion.style} · {output.bgm_suggestion.mood} · BPM{" "}
          {output.bgm_suggestion.bpm_range}
          <br />
          参考：{output.bgm_suggestion.reference}
        </div>
      </Field>
      {hasSegments ? (
        <Field label="故事板片段">
          <div className="space-y-3">
            {output.segments!.map((seg) => (
              <SegmentCard key={seg.segment_id} segment={seg} />
            ))}
          </div>
        </Field>
      ) : (
        <Field label="分镜表">
          <ShotsTable shots={output.shots} />
        </Field>
      )}
      {output.production_notes && (
        <Field label="制作备注">
          <p className="text-xs text-ink-soft">{output.production_notes}</p>
        </Field>
      )}
    </div>
  );
}

/** 单个故事板片段卡片：段头 + 镜头表 + 04b 故事板文本 + 导演板图。 */
function SegmentCard({ segment }: { segment: StorySegment }) {
  const storyboardExport = useExportStoryboardToCanvas();
  const hasStoryboardText = !!segment.storyboard_text?.trim();
  const boardUrl = segment.storyboard_board_image_url?.trim() || null;
  const resolvedBoardUrl = boardUrl ? resolveMediaUrl(boardUrl) : null;

  return (
    <div className="rounded-md border border-border/70 bg-secondary/20 p-2">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="font-mono">
          片段 {segment.segment_id}
        </Badge>
        <span className="whitespace-nowrap text-ink-soft">
          {segment.start_time}-{segment.end_time}
        </span>
        <span className="whitespace-nowrap text-ink-faint">
          {segment.duration_seconds}s · {segment.shots.length} 镜
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 px-2 text-[11px]"
          onClick={() => void storyboardExport.exportToCanvas()}
          disabled={!hasStoryboardText || storyboardExport.exporting}
          title={
            !hasStoryboardText
              ? "故事板文本未生成，无法进入画布"
              : "把全部片段与素材导入无限画布，在画布上生成段级导演板图"
          }
        >
          {storyboardExport.exporting ? (
            <>
              <Loader2 size={12} className="mr-1 animate-spin" />
              导出中…
            </>
          ) : (
            <>
              <LayoutGrid size={12} className="mr-1" />
              在画布中生成故事板
            </>
          )}
        </Button>
      </div>
      <ShotsTable shots={segment.shots} />
      <div className="mt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          故事板文本（04b 导演蓝图）
        </div>
        {hasStoryboardText ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-secondary/40 p-2 text-[11px] leading-relaxed text-ink-soft">
            {segment.storyboard_text}
          </pre>
        ) : (
          <p className="text-xs text-ink-faint italic">
            故事板文本未生成（可能正在生成或生成失败）
          </p>
        )}
      </div>
      {storyboardExport.error && (
        <p className="mt-1 text-[11px] text-destructive">
          {storyboardExport.error}（可重试）
        </p>
      )}
      {resolvedBoardUrl ? (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              导演板图（Prompt B · SMART SHOT SHEET V2，历史生成）
            </span>
          </div>
          <img
            src={resolvedBoardUrl}
            alt={`片段 ${segment.segment_id} 导演板图`}
            className="w-full rounded-md border border-border/60 shadow-sm"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-border/60 bg-secondary/20 p-3 text-center">
          <p className="text-[11px] text-ink-faint">
            导演板图在无限画布中生成（点击上方「在画布中生成故事板」进入）
          </p>
        </div>
      )}
    </div>
  );
}

/** 分镜表（段内或平铺回退共用）。 */
function ShotsTable({ shots }: { shots: Shot[] }) {
  if (!shots.length) {
    return <p className="text-xs text-ink-faint italic">无镜头</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-ink-faint">
            <th className="p-1.5">#</th>
            <th className="p-1.5">时长</th>
            <th className="p-1.5">镜头</th>
            <th className="p-1.5">画面</th>
            <th className="p-1.5">旁白</th>
          </tr>
        </thead>
        <tbody>
          {shots.map((shot) => (
            <tr key={shot.shot_id} className="border-b border-border/60 align-top">
              <td className="p-1.5 font-mono">{shot.shot_id}</td>
              <td className="p-1.5 whitespace-nowrap">
                {shot.start_time}-{shot.end_time}
              </td>
              <td className="p-1.5">
                {shot.shot_type}
                <br />
                <span className="text-ink-faint">{shot.camera_movement}</span>
              </td>
              <td className="p-1.5">{shot.visual_description}</td>
              <td className="p-1.5">{shot.voiceover}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisualView({ output }: { output: VisualOutput }) {
  // 后端 models.py 中 color_palette / quality_tags 为 str（逗号分隔），
  // 这里兼容字符串与数组两种形态。
  const palette = toArray(output.visual_style.color_palette);
  const qualityTags = toArray(output.visual_style.quality_tags);

  return (
    <div className="space-y-2">
      <Field label="视觉风格">
        <div className="text-xs">
          <div>风格：{output.visual_style.style}</div>
          <div>比例：{output.visual_style.aspect_ratio}</div>
          {palette.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {palette.map((c, i) => (
                <Badge key={i} variant="outline" className="font-mono text-[10px]">
                  {c}
                </Badge>
              ))}
            </div>
          )}
          {qualityTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {qualityTags.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="分镜图片 Prompt">
        <div className="space-y-2">
          {output.shot_prompts.map((sp) => (
            <div key={sp.shot_id} className="rounded-md border border-border p-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono text-xs text-ink-faint">{sp.shot_id}</span>
                <Badge variant="outline" className="text-[10px]">
                  {sp.aspect_ratio}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {sp.recommended_tool}
                </Badge>
              </div>
              <p className="text-xs">{sp.prompt}</p>
              {sp.negative_prompt && (
                <p className="mt-1 text-[10px] text-ink-faint">
                  负面：{sp.negative_prompt}
                </p>
              )}
            </div>
          ))}
        </div>
      </Field>
      <Field label="一致性指引">
        <p className="text-xs text-ink-soft">{output.consistency_guide}</p>
      </Field>
    </div>
  );
}

function DistributorView({ output }: { output: DistributorOutput }) {
  return (
    <div className="space-y-2">
      <Field label="投放平台">
        <Badge variant="secondary">{output.platform}</Badge>
      </Field>
      <Field label="发布标题">
        <p className="font-medium">{output.publish_content.title}</p>
      </Field>
      <Field label="发布描述">
        <p className="text-xs text-ink-soft">{output.publish_content.description}</p>
      </Field>
      <Field label="话题标签">
        <div className="flex flex-wrap gap-1">
          {output.publish_content.hashtags.map((tag, i) => (
            <Badge key={i} variant="outline" className="font-mono text-[10px]">
              #{tag}
            </Badge>
          ))}
        </div>
      </Field>
      <Field label="发布策略">
        <div className="text-xs text-ink-soft">
          最佳时间：{output.publish_strategy.best_time}
          <br />
          最佳日期：{output.publish_strategy.best_days.join("、")}
          <br />
          频率：{output.publish_strategy.frequency}
          {output.publish_strategy.first_comment && (
            <>
              <br />
              首条评论：{output.publish_strategy.first_comment}
            </>
          )}
        </div>
      </Field>
      <Field label="视频规格">
        <div className="text-xs text-ink-soft">
          {output.video_specs.resolution} · {output.video_specs.aspect_ratio} ·{" "}
          {output.video_specs.fps}fps · {output.video_specs.file_format}
          <br />
          最长：{output.video_specs.max_duration}
        </div>
      </Field>
      {output.promotion_suggestions.length > 0 && (
        <Field label="推广建议">
          <ul className="ml-4 list-disc space-y-0.5 text-xs">
            {output.promotion_suggestions.map((p, i) => (
              <li key={i}>
                <strong>{p.type}：</strong>
                {p.description}
                {p.budget_hint && <span className="text-ink-faint">（{p.budget_hint}）</span>}
              </li>
            ))}
          </ul>
        </Field>
      )}
      {output.platform_specific_notes && (
        <Field label="平台专属提示">
          <p className="text-xs text-ink-soft">{output.platform_specific_notes}</p>
        </Field>
      )}
    </div>
  );
}

// ============================================================
// 通用辅助
// ============================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

/**
 * 将「可能是逗号分隔字符串或数组」的值规范化为字符串数组。
 * 后端 visual_style.color_palette / quality_tags 是 str，前端需要数组来 .map。
 */
function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** 极简 Markdown 渲染（仅支持 # 标题、**粗体**、- 列表、空行段落）。 */
function renderMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, '<h3 class="font-display text-base font-semibold mt-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-display text-lg font-semibold mt-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-display text-xl font-semibold mt-3">$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, "</p><p class=\"text-sm text-ink-soft mt-2\">")
    .replace(/^/, '<p class="text-sm text-ink-soft">')
    .replace(/$/, "</p>");
}
