/**
 * 故事板编排 hook：从工坊导入分镜、单镜/批量生成、视频合成。
 *
 * 职责：
 * - loadFromWorkshop(payload)：把工坊 StoryboardPayload 转成 ShotNode 阵列写入 store。
 * - generateShot(shotNodeId)：单镜生成，调批量 API 的单镜版，回写 ShotNode 状态。
 * - generateAllShots()：批量生成所有 idle/error 状态的 shot。
 * - composeStoryboard()：收集所有 done 状态 shot 的结果图与旁白，调合成 API。
 *
 * 与 useCanvasGenerate 的区别：useCanvasGenerate 走单生成节点 API；
 * 本 hook 走故事板批量 API，直接以 ShotNode 的 visualPrompt 为提示词，
 * 不需要单独的 GenerateNode。
 */
import { useState } from "react";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  useStoryboardGenerateMutation,
  useStoryboardComposeMutation,
} from "@/hooks/use-canvas";
import { makeShotNodes, type ShotImport } from "@/components/canvas/nodeFactory";
import type { CanvasNode, ShotNodeData } from "@/components/canvas/types";
import type {
  ShotInputDTO,
  ShotResultInputDTO,
  StoryboardPayload,
} from "@/types/api";

/** 把 ShotNodeData 转成后端 ShotInputDTO。 */
function shotNodeToInput(
  node: { id: string; data: ShotNodeData },
): ShotInputDTO {
  const d = node.data;
  return {
    shot_id: d.shotId || node.id,
    title: d.title,
    visual_prompt: d.visualPrompt,
    narration: d.narration,
    duration: d.duration,
    reference_image_url: d.referenceImageUrl,
    reference_type: d.referenceType,
    node_id: node.id,
  };
}

/** 从画布节点列表中提取所有 ShotNode（按画布顺序）。 */
function selectShotNodes(
  nodes: CanvasNode[],
): Array<{ id: string; data: ShotNodeData }> {
  return nodes.filter(
    (n): n is CanvasNode & { data: ShotNodeData } =>
      (n.data as { kind?: string }).kind === "shot",
  );
}

export function useCanvasStoryboard() {
  const generateMutation = useStoryboardGenerateMutation();
  const composeMutation = useStoryboardComposeMutation();
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  /**
   * 从工坊 payload 导入分镜到当前画布项目。
   *
   * 在已 loadProject/newProject 的画布上追加 ShotNode 阵列，并写入素材库与旁白。
   * 不创建新项目（由调用方在跳转前创建并 loadProject）。
   */
  function loadFromWorkshop(payload: StoryboardPayload): void {
    const store = useCanvasStore.getState();
    if (!store.projectId) {
      console.warn("[storyboard] 未关联项目，无法导入分镜");
      return;
    }

    const shots: ShotImport[] = payload.shots.map((s) => ({
      shotId: s.shot_id,
      title: s.title,
      visualPrompt: s.visual_prompt,
      narration: s.narration,
      duration: s.duration,
      referenceImageUrl: s.reference_image_url,
      referenceType: s.reference_type,
    }));

    const nodes = makeShotNodes(shots, { startX: 0, startY: 0, rowGap: 280 });
    store.addNodes(nodes);
    store.setMode("storyboard");

    const assets = {
      character: payload.character_ref
        ? { url: payload.character_ref, label: "人物" }
        : undefined,
      object: payload.object_ref
        ? { url: payload.object_ref, label: "物品" }
        : undefined,
      scene: payload.scene_ref
        ? { url: payload.scene_ref, label: "场景" }
        : undefined,
    };
    store.setStoryboardAssets(assets);
    if (payload.voiceover_text) {
      store.setStoryboardVoiceover(payload.voiceover_text);
    }
  }

  /**
   * 生成单个分镜图片。
   *
   * 以 shot 的 visualPrompt 为提示词，参考图优先级与后端一致：
   * shot.referenceImageUrl → 按 referenceType 回退到素材库 → 纯文生图。
   */
  async function generateShot(shotNodeId: string): Promise<void> {
    const store = useCanvasStore.getState();
    if (!store.projectId) {
      store.updateNodeData(shotNodeId, {
        status: "error",
        error: "未关联项目",
      } as Partial<ShotNodeData>);
      return;
    }

    const shotNode = store.nodes.find((n) => n.id === shotNodeId);
    if (!shotNode) return;
    const d = shotNode.data as ShotNodeData;
    if (!d.visualPrompt.trim()) {
      store.updateNodeData(shotNodeId, {
        status: "error",
        error: "画面描述不能为空",
      } as Partial<ShotNodeData>);
      return;
    }

    setGeneratingIds((prev) => new Set(prev).add(shotNodeId));
    store.updateNodeData(shotNodeId, {
      status: "running",
      error: undefined,
    } as Partial<ShotNodeData>);

    const assets = store.storyboardAssets;
    try {
      const res = await generateMutation.mutateAsync({
        projectId: store.projectId,
        body: {
          shots: [shotNodeToInput({ id: shotNodeId, data: d })],
          character_ref: assets.character?.url,
          object_ref: assets.object?.url,
          scene_ref: assets.scene?.url,
          size: "1920x1920",
          concurrency: 1,
        },
      });

      const result = res.results?.[0];
      if (result?.status === "done" && result.result_image_url) {
        store.updateNodeData(shotNodeId, {
          status: "done",
          resultImageUrl: result.result_image_url,
          error: undefined,
        } as Partial<ShotNodeData>);
      } else {
        store.updateNodeData(shotNodeId, {
          status: "error",
          error: result?.error ?? "生成失败",
        } as Partial<ShotNodeData>);
      }
    } catch (e) {
      store.updateNodeData(shotNodeId, {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      } as Partial<ShotNodeData>);
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(shotNodeId);
        return next;
      });
    }
  }

  /**
   * 批量生成所有 idle / error 状态的分镜。
   *
   * 调一次批量 API（后端并发控制），然后按 node_id 回写每个 shot 状态。
   */
  async function generateAllShots(): Promise<void> {
    const store = useCanvasStore.getState();
    if (!store.projectId) return;

    const shotNodes = selectShotNodes(store.nodes);
    const pending = shotNodes.filter((n) => {
      const st = (n.data as ShotNodeData).status;
      return st === "idle" || st === "error";
    });
    if (pending.length === 0) return;

    // 标记所有 pending 为 running
    pending.forEach((n) => {
      store.updateNodeData(n.id, {
        status: "running",
        error: undefined,
      } as Partial<ShotNodeData>);
    });
    setGeneratingIds(new Set(pending.map((n) => n.id)));

    const assets = store.storyboardAssets;
    try {
      const res = await generateMutation.mutateAsync({
        projectId: store.projectId,
        body: {
          shots: pending.map((n) =>
            shotNodeToInput({ id: n.id, data: n.data as ShotNodeData }),
          ),
          character_ref: assets.character?.url,
          object_ref: assets.object?.url,
          scene_ref: assets.scene?.url,
          size: "1920x1920",
          concurrency: 3,
        },
      });

      // 按 node_id 回写结果
      const resultById = new Map(
        (res.results ?? []).map((r) => [r.node_id, r]),
      );
      pending.forEach((n) => {
        const r = resultById.get(n.id);
        if (r?.status === "done" && r.result_image_url) {
          store.updateNodeData(n.id, {
            status: "done",
            resultImageUrl: r.result_image_url,
            error: undefined,
          } as Partial<ShotNodeData>);
        } else {
          store.updateNodeData(n.id, {
            status: "error",
            error: r?.error ?? "生成失败",
          } as Partial<ShotNodeData>);
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pending.forEach((n) => {
        store.updateNodeData(n.id, {
          status: "error",
          error: msg,
        } as Partial<ShotNodeData>);
      });
    } finally {
      setGeneratingIds(new Set());
    }
  }

  /**
   * 收集所有 done 状态 shot 的结果图与旁白，调合成 API。
   *
   * 旁白优先使用 store.storyboardVoiceover，否则拼接各 shot narration。
   */
  async function composeStoryboard(): Promise<{
    videoUrl: string | null;
    error: string | null;
  }> {
    const store = useCanvasStore.getState();
    if (!store.projectId) {
      return { videoUrl: null, error: "未关联项目" };
    }

    const shotNodes = selectShotNodes(store.nodes);
    const done = shotNodes.filter(
      (n) => (n.data as ShotNodeData).status === "done",
    );
    if (done.length === 0) {
      return { videoUrl: null, error: "没有已完成的分镜图" };
    }

    const shotResults: ShotResultInputDTO[] = done.map((n) => {
      const d = n.data as ShotNodeData;
      return {
        shot_id: d.shotId || n.id,
        image_url: d.resultImageUrl ?? "",
        narration: d.narration,
        duration: d.duration,
      };
    });

    try {
      const res = await composeMutation.mutateAsync({
        projectId: store.projectId,
        body: {
          shot_results: shotResults,
          voiceover_text: store.storyboardVoiceover || undefined,
        },
      });
      return {
        videoUrl: res.video_url,
        error: res.status === "success" ? null : (res.error ?? "合成失败"),
      };
    } catch (e) {
      return {
        videoUrl: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    loadFromWorkshop,
    generateShot,
    generateAllShots,
    composeStoryboard,
    isGenerating: generatingIds.size > 0,
    isGeneratePending: generateMutation.isPending,
    isComposePending: composeMutation.isPending,
  };
}
