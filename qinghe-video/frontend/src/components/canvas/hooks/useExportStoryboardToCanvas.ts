/**
 * 工坊 → 画布故事板一键导出 hook。
 *
 * 把工坊 scriptwriter_output.segments（04b 段级故事板文本，段级导演板主载荷）
 * + visual_output.shot_prompts（shot 级回退）+ 一致性参考图（人物/物品/场景）
 * + 整体旁白 + 段级导演板系统提示词一键导入无限画布故事板模式。
 *
 * 供 WorkshopPage 顶部导出条与 AgentOutputView 的 SegmentCard「在画布中生成故事板」共用，
 * 避免重复实现建项目 / loadProject / loadFromWorkshop / 跳转逻辑。
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateCanvasProject } from "@/hooks/use-canvas";
import { useCanvasStore } from "@/stores/canvas-store";
import { useCanvasStoryboard } from "@/components/canvas/hooks/useCanvasStoryboard";
import { useWorkshopStore } from "@/stores/workshop-store";
import { ROUTES } from "@/lib/constants";
import { STORYBOARD_BOARD_PROMPT } from "@/lib/storyboardBoardPrompt";
import type {
  CopywriterOutput,
  ScriptwriterOutput,
  ShotPrompt,
  StoryboardPayload,
  StoryboardShot,
  VisualOutput,
} from "@/types/api";

/** 从 copywriter_output 提取整体旁白文本（full_script 优先，否则拼接 body）。 */
function extractVoiceoverText(): string {
  const st = useWorkshopStore.getState();
  const co = st.workshopState.copywriter_output as CopywriterOutput | undefined;
  if (co?.full_script) return co.full_script;
  if (co?.body?.length) return co.body.map((b) => b.text).join("\n");
  if (co?.hook?.text) return co.hook.text;
  return "";
}

export function useExportStoryboardToCanvas() {
  const createCanvasProject = useCreateCanvasProject();
  const storyboard = useCanvasStoryboard();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 构造故事板 payload。
   *
   * 优先 segments（04b 段级故事板文本）；无可用 segments 时回退 shots（旧数据 / 04b 未生成）。
   * 返回 null 表示数据不完整（调用方应禁用按钮）。
   */
  function buildPayload(): StoryboardPayload | null {
    const st = useWorkshopStore.getState();
    const sw = st.workshopState.scriptwriter_output as
      | ScriptwriterOutput
      | undefined;
    if (!sw) return null;

    const vo = st.workshopState.visual_output as VisualOutput | undefined;
    const promptMap = vo?.shot_prompts?.length
      ? new Map(vo.shot_prompts.map((p) => [p.shot_id, p]))
      : new Map<string, ShotPrompt>();
    const fallbackPrompts = vo?.shot_prompts ?? [];
    const m = st.mediaResults;

    // 优先段级故事板（04b）：仅保留含 storyboard_text 的段
    const segments = (sw.segments ?? [])
      .filter((s) => s.storyboard_text?.trim())
      .map((s) => ({
        segment_id: String(s.segment_id),
        title: `片段 ${s.segment_id}`,
        storyboard_text: s.storyboard_text,
      }));

    if (segments.length > 0) {
      return {
        segments,
        character_ref: m.characterImage?.url ?? undefined,
        object_ref: m.objectImage?.url ?? undefined,
        scene_ref: m.sceneImage?.url ?? undefined,
        voiceover_text: extractVoiceoverText() || undefined,
        systemPrompt: STORYBOARD_BOARD_PROMPT,
      };
    }

    // 回退 shot 级（旧数据 / 04b 未生成）
    if (!sw.shots?.length) return null;
    const shots: StoryboardShot[] = sw.shots.map((s, idx) => {
      const sp = promptMap.get(s.shot_id) ?? fallbackPrompts[idx];
      return {
        shot_id: s.shot_id,
        title: `分镜 ${idx + 1}`,
        visual_prompt: sp?.prompt ?? s.visual_description ?? "",
        narration: s.voiceover ?? "",
        duration: s.duration_seconds ?? 3.5,
      };
    });
    return {
      shots,
      character_ref: m.characterImage?.url ?? undefined,
      object_ref: m.objectImage?.url ?? undefined,
      scene_ref: m.sceneImage?.url ?? undefined,
      voiceover_text: extractVoiceoverText() || undefined,
      systemPrompt: STORYBOARD_BOARD_PROMPT,
    };
  }

  /**
   * 一键将工坊故事板导出到无限画布。
   *
   * 流程：构造 payload → 创建新画布项目 → loadProject → loadFromWorkshop
   * （追加 SegmentNode/ShotNode 阵列、设置素材库、旁白、系统提示词）→ 跳转 /canvas。
   *
   * @returns 是否成功（失败时 error 已写入 state）
   */
  async function exportToCanvas(): Promise<boolean> {
    const payload = buildPayload();
    if (!payload) {
      setError("请先完成「脚本」步骤");
      return false;
    }
    setExporting(true);
    setError(null);
    try {
      const ws = useWorkshopStore.getState();
      const res = await createCanvasProject.mutateAsync({
        name: `故事板 ${ws.form.product_name || ""} ${new Date().toLocaleString("zh-CN", { hour12: false })}`.trim(),
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      const canvasStore = useCanvasStore.getState();
      canvasStore.loadProject({
        id: res.id,
        name: res.name,
        nodes: res.nodes,
        edges: res.edges,
        viewport: res.viewport,
      });
      storyboard.loadFromWorkshop(payload);
      navigate(ROUTES.canvas);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`导出失败：${msg}`);
      return false;
    } finally {
      setExporting(false);
    }
  }

  return {
    exportToCanvas,
    buildPayload,
    /** 当前是否可导出（payload 可构造）。注意：仅在 hook 所属组件重渲染时刷新。 */
    canExport: !!buildPayload(),
    exporting,
    error,
  };
}
