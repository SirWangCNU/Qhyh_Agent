/**
 * 工坊自动保存 hook：监听工坊改动，debounce 2s 后 PUT /api/workshop/sessions/{id}。
 *
 * - 仅在 dirty && sessionId 存在时触发
 * - 任何 steps/stepOutputs/form/topics/mediaResults 等变动都会重置 2s 计时器
 * - 保存中显示 "saving"，成功 markSaved()（dirty=false, "saved"），失败 "error" 不阻断
 *
 * 镜像 components/canvas/hooks/useCanvasAutosave.ts 的实现。
 * 在 WorkshopPage 顶层调用一次即可。
 */
import { useEffect } from "react";
import { useWorkshopStore } from "@/stores/workshop-store";
import { useUpdateWorkshopSession } from "@/hooks/use-workshop-sessions";

const DEBOUNCE_MS = 2000;

export function useWorkshopAutosave() {
  const dirty = useWorkshopStore((s) => s.dirty);
  const sessionId = useWorkshopStore((s) => s.sessionId);
  const sessionName = useWorkshopStore((s) => s.sessionName);
  const steps = useWorkshopStore((s) => s.steps);
  const stepOutputs = useWorkshopStore((s) => s.stepOutputs);
  const stepErrors = useWorkshopStore((s) => s.stepErrors);
  const workshopState = useWorkshopStore((s) => s.workshopState);
  const mediaResults = useWorkshopStore((s) => s.mediaResults);
  const autoRunToStep = useWorkshopStore((s) => s.autoRunToStep);
  const currentStep = useWorkshopStore((s) => s.currentStep);
  const form = useWorkshopStore((s) => s.form);
  const oneLiner = useWorkshopStore((s) => s.oneLiner);
  const topics = useWorkshopStore((s) => s.topics);
  const selectedTopicIndex = useWorkshopStore((s) => s.selectedTopicIndex);
  const selectedTopic = useWorkshopStore((s) => s.selectedTopic);
  const setSaveStatus = useWorkshopStore((s) => s.setSaveStatus);
  const update = useUpdateWorkshopSession();

  useEffect(() => {
    if (!sessionId || !dirty) return;
    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        const snapshot = useWorkshopStore.getState().buildSnapshot();
        await update.mutateAsync({
          id: sessionId,
          body: { name: sessionName, state: snapshot },
        });
        useWorkshopStore.getState().markSaved();
      } catch (e) {
        console.error("[Workshop] 自动保存失败", e);
        useWorkshopStore.getState().setSaveStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dirty,
    sessionId,
    sessionName,
    steps,
    stepOutputs,
    stepErrors,
    workshopState,
    mediaResults,
    autoRunToStep,
    currentStep,
    form,
    oneLiner,
    topics,
    selectedTopicIndex,
    selectedTopic,
  ]);
}
