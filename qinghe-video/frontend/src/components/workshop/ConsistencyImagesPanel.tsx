import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkshopStore } from "@/stores/workshop-store";
import {
  ConsistencyCard,
  TYPE_META,
  type ConsistencyCardHandle,
} from "@/components/workshop/ConsistencyCard";
import {
  ConsistencyLightbox,
  type ConsistencyLightboxState,
} from "@/components/workshop/ConsistencyLightbox";
import type { ConsistencyImageType, ConsistencyPlan } from "@/types/api";

const CARD_TYPES: ConsistencyImageType[] = ["character", "object", "scene"];

/**
 * 一致性生图面板（工坊第 3 步）。
 *
 * 顶部工具栏：全部生成（串行触发已填主体的卡片）+ 从策划填充（按类型预填主体描述）。
 * 下方 3 张独立卡片：人物 / 物品 / 场景，各自独立生成。
 * 任意一张成功后，步骤状态置为 done，并把主体描述写入 workshopState.consistency_references
 * 供第 5 步 visual_designer 注入。
 */
export function ConsistencyImagesPanel() {
  const cardRefs = useRef<Record<ConsistencyImageType, ConsistencyCardHandle | null>>({
    character: null,
    object: null,
    scene: null,
  });
  const [lightbox, setLightbox] = useState<ConsistencyLightboxState | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const form = useWorkshopStore((s) => s.form);
  const consistencyPlan = useWorkshopStore(
    (s) => s.workshopState.copywriter_output?.consistency_plan,
  );

  // 文案步骤完成后自动填充一致性规划（含刷新恢复场景）
  useEffect(() => {
    applyConsistencyPlan(consistencyPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consistencyPlan]);

  /** 串行触发所有已填主体的卡片生成。 */
  async function handleBatchGenerate() {
    setBatchRunning(true);
    try {
      for (const type of CARD_TYPES) {
        const handle = cardRefs.current[type];
        if (handle) {
          // generate 内部会校验 subject 非空，空则返回 false 不阻塞后续
          await handle.generate();
        }
      }
    } finally {
      setBatchRunning(false);
    }
  }

  /** 从策划表单预填主体描述：物品←产品+卖点，场景←产地，人物←留空提示。 */
  function handleFillFromForm() {
    const objectSubject = [form.product_name, form.selling_points]
      .filter(Boolean)
      .join("，");
    if (objectSubject) cardRefs.current.object?.fillFields({ subject: objectSubject });
    if (form.origin) cardRefs.current.scene?.fillFields({ subject: form.origin });
    // 人物无对应字段，留空由用户手填
  }

  /** 把文案 Agent 生成的一致性规划填充到三个卡片（仅填充空字段）。 */
  function applyConsistencyPlan(plan?: ConsistencyPlan) {
    if (!plan) return;
    if (plan.character_subject) {
      cardRefs.current.character?.fillFields({ subject: plan.character_subject });
    }
    if (plan.object_subject) {
      cardRefs.current.object?.fillFields({ subject: plan.object_subject });
    }
    if (plan.scene_subject) {
      cardRefs.current.scene?.fillFields({ subject: plan.scene_subject });
    }
    if (plan.style_preference) {
      CARD_TYPES.forEach((type) => {
        cardRefs.current[type]?.fillFields({ stylePreference: plan.style_preference });
      });
    }
  }

  function openLightbox(url: string, prompt: string, title: string, downloadName: string) {
    setLightbox({ url, prompt, title, downloadName });
  }

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2.5">
        <Button
          size="sm"
          onClick={() => void handleBatchGenerate()}
          disabled={batchRunning}
          className="text-xs"
        >
          {batchRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 批量生成中...
            </>
          ) : (
            <>
              <Sparkles size={14} /> 全部生成
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleFillFromForm}
          disabled={batchRunning}
          className="text-xs"
        >
          <Wand2 size={14} /> 从策划填充
        </Button>
        <span className="text-[11px] text-ink-faint">
          全部生成：串行触发已填主体的卡片；从策划填充：物品←产品+卖点，场景←产地
        </span>
      </div>

      {/* 3 张卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        {CARD_TYPES.map((type) => (
          <ConsistencyCard
            key={type}
            type={type}
            ref={(h) => {
              cardRefs.current[type] = h;
            }}
            onLightbox={openLightbox}
          />
        ))}
      </div>

      {/* 放大查看弹窗 */}
      <ConsistencyLightbox state={lightbox} onOpenChange={(open) => !open && setLightbox(null)} />
    </div>
  );
}

// 保留 TYPE_META 导出兼容（供其他模块按需引用）
export { TYPE_META };
