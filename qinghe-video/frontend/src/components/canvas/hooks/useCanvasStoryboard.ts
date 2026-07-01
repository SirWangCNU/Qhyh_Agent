/**
 * 故事板编排 hook：从工坊导入分镜/段、单镜/段级批量生成、视频合成。
 *
 * 职责：
 * - loadFromWorkshop(payload)：把工坊 StoryboardPayload 转成节点阵列写入 store。
 *   优先导入 segments（04b 故事板文本 + 段级导演板），否则回退 shots（旧 shot 级）。
 * - generateShot(shotNodeId)：单镜生成，调批量 API 的单镜版，回写 ShotNode 状态。
 * - generateAllShots()：批量生成所有 idle/error 状态的 shot。
 * - generateSegment(segmentNodeId)：单段导演板图生成，调段级批量 API 单段版。
 * - generateAllSegments()：批量生成所有 idle/error 状态的 segment。
 * - composeStoryboard()：收集所有 done 状态 shot 的结果图与旁白，调合成 API。
 *
 * 与 useCanvasGenerate 的区别：useCanvasGenerate 走单生成节点 API；
 * 本 hook 走故事板批量 API，直接以节点内文本为提示词，不需要单独的 GenerateNode。
 */
import { useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  useStoryboardGenerateMutation,
  useStoryboardSegmentGenerateMutation,
  useStoryboardComposeMutation,
} from "@/hooks/use-canvas";
import {
  makePromptNode,
  makeReferenceImageNode,
  makeSegmentNodes,
  makeShotNodes,
  type SegmentImport,
  type ShotImport,
} from "@/components/canvas/nodeFactory";
import type {
  CanvasNode,
  CanvasNodeData,
  SegmentNodeData,
  ShotNodeData,
} from "@/components/canvas/types";
import type {
  SegmentInputDTO,
  ShotInputDTO,
  ShotResultInputDTO,
  StoryboardPayload,
} from "@/types/api";

/** 连线收集到的段级生成输入。 */
export interface SegmentInputs {
  /** 来自 prompt(role=storyboard) 节点（含 generic 追加）。 */
  storyboardText: string;
  /** 来自 prompt(role=system) 节点。 */
  systemPrompt: string;
  /** 来自 referenceImage 节点的 URL 列表。 */
  contentRefs: string[];
  hasStoryboard: boolean;
  hasSystem: boolean;
}

/**
 * 纯函数：按入边收集 segment 节点的所有输入。
 *
 * - prompt(role=system) → systemPrompt（取最后一个）
 * - prompt(role=storyboard) → storyboardText
 * - prompt(role=generic) → 追加到 storyboardText（\n\n 分隔）
 * - referenceImage → contentRefs
 *
 * 注意：不回退到 segment 节点内嵌字段，回退逻辑由 generateSegment 处理。
 */
export function collectSegmentInputs(
  segmentNodeId: string,
  nodes: CanvasNode[],
  edges: Edge[],
): SegmentInputs {
  const inEdges = edges.filter((e) => e.target === segmentNodeId);
  const incomers = inEdges
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter((n): n is CanvasNode => !!n);

  let storyboardText = "";
  let systemPrompt = "";
  const contentRefs: string[] = [];

  for (const node of incomers) {
    const data = node.data as CanvasNodeData;
    if (data.kind === "prompt") {
      const role = data.role ?? "generic";
      if (role === "system") {
        systemPrompt = data.prompt;
      } else if (role === "storyboard") {
        storyboardText = data.prompt;
      } else {
        storyboardText += (storyboardText ? "\n\n" : "") + data.prompt;
      }
    } else if (data.kind === "referenceImage" && data.imageUrl) {
      contentRefs.push(data.imageUrl);
    }
  }

  return {
    storyboardText,
    systemPrompt,
    contentRefs,
    hasStoryboard: !!storyboardText,
    hasSystem: !!systemPrompt,
  };
}

/**
 * Hook：订阅 segment 节点的入边输入（供 StoryboardSegmentNode 显示就绪状态）。
 */
export function useSegmentInputs(nodeId: string): SegmentInputs {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  return useMemo(
    () => collectSegmentInputs(nodeId, nodes, edges),
    [nodeId, nodes, edges],
  );
}

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

/** 把 SegmentNodeData + 入边收集的 inputs 转成后端 SegmentInputDTO。
 *
 * 优先用入边收集的 storyboardText/systemPrompt；无入边时回退到节点内嵌字段（向后兼容老项目）。
 */
function segmentNodeToInput(
  node: { id: string; data: SegmentNodeData },
  inputs: SegmentInputs,
): SegmentInputDTO {
  const d = node.data;
  // 优先入边收集，无入边时回退内嵌字段
  const storyboardText = inputs.storyboardText || d.storyboardText;
  const systemPrompt = inputs.systemPrompt || d.systemPrompt;
  return {
    segment_id: d.segmentId || node.id,
    storyboard_text: storyboardText,
    // 空字符串视为未传，由后端兜底 STORYBOARD_BOARD_PROMPT
    system_prompt: systemPrompt.trim() ? systemPrompt : undefined,
    title: d.title,
    node_id: node.id,
  };
}

/** 从画布节点列表中提取所有 SegmentNode（按画布顺序）。 */
function selectSegmentNodes(
  nodes: CanvasNode[],
): Array<{ id: string; data: SegmentNodeData }> {
  return nodes.filter(
    (n): n is CanvasNode & { data: SegmentNodeData } =>
      (n.data as { kind?: string }).kind === "segment",
  );
}

export function useCanvasStoryboard() {
  const generateMutation = useStoryboardGenerateMutation();
  const segmentGenerateMutation = useStoryboardSegmentGenerateMutation();
  const composeMutation = useStoryboardComposeMutation();
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  /**
   * 从工坊 payload 导入分镜/段到当前画布项目。
   *
   * 优先导入 segments（04b 故事板文本 + 段级导演板），否则回退 shots（旧 shot 级）。
   * 在已 loadProject/newProject 的画布上追加节点阵列，并写入素材库、旁白、系统提示词。
   * 不创建新项目（由调用方在跳转前创建并 loadProject）。
   */
  function loadFromWorkshop(payload: StoryboardPayload): void {
    const store = useCanvasStore.getState();
    if (!store.projectId) {
      console.warn("[storyboard] 未关联项目，无法导入分镜");
      return;
    }

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
    if (payload.systemPrompt) {
      store.setSystemPrompt(payload.systemPrompt);
    }

    // 优先导入 segments（04b 段级故事板）；无则回退 shots
    if (payload.segments && payload.segments.length > 0) {
      // 计算实际生效的系统提示词（payload 优先，否则用 store 现值）
      const effectiveSystemPrompt = payload.systemPrompt || store.systemPrompt;

      // 段节点：纵向排列在 x=0 列（systemPrompt 留空，由边汇入；
      // storyboardText 仍写入作为向后兼容回退）
      const segs: SegmentImport[] = payload.segments.map((s) => ({
        segmentId: s.segment_id,
        title: s.title,
        storyboardText: s.storyboard_text,
      }));
      const segmentNodes = makeSegmentNodes(
        segs,
        { startX: 0, startY: 0, rowGap: 460 },
        "", // 段节点 systemPrompt 留空，由共享系统提示词节点通过边汇入
      );

      // 共享系统提示词节点（所有段共用一个，位于第一段左上方）
      const sysPromptNode = makePromptNode(
        "system",
        effectiveSystemPrompt,
        { x: -400, y: -100 },
        "系统提示词",
      );

      // 每段一个故事板文本节点（位于段左侧，与段同高）
      const storyNodes = segmentNodes.map((segNode, i) => {
        const segY = segNode.position.y;
        const seg = segs[i]!;
        return makePromptNode(
          "storyboard",
          seg.storyboardText,
          { x: -400, y: segY },
          `故事板 · 段${seg.segmentId}`,
        );
      });

      // 参考图节点（来自 payload.character_ref / object_ref / scene_ref）
      // 垂直堆叠在画布左上角
      const refEntries: Array<{ url: string; label: string }> = [];
      if (payload.character_ref) {
        refEntries.push({ url: payload.character_ref, label: "人物参考" });
      }
      if (payload.object_ref) {
        refEntries.push({ url: payload.object_ref, label: "物品参考" });
      }
      if (payload.scene_ref) {
        refEntries.push({ url: payload.scene_ref, label: "场景参考" });
      }
      const refNodes = refEntries.map((r, i) =>
        makeReferenceImageNode(r.url, { x: -600, y: -300 + i * 140 }, r.label),
      );

      // 构造边：每个 prompt/ref 节点 → 对应段节点
      const newEdges: Edge[] = [];
      // 系统提示词 → 所有段
      for (const segNode of segmentNodes) {
        newEdges.push({
          id: `e-sys-${segNode.id}`,
          source: sysPromptNode.id,
          target: segNode.id,
        });
      }
      // 故事板文本 → 对应段
      segmentNodes.forEach((segNode, i) => {
        const storyNode = storyNodes[i]!;
        newEdges.push({
          id: `e-story-${segNode.id}`,
          source: storyNode.id,
          target: segNode.id,
        });
      });
      // 参考图 → 所有段
      for (const refNode of refNodes) {
        for (const segNode of segmentNodes) {
          newEdges.push({
            id: `e-ref-${refNode.id}-${segNode.id}`,
            source: refNode.id,
            target: segNode.id,
          });
        }
      }

      const allNodes = [sysPromptNode, ...storyNodes, ...refNodes, ...segmentNodes];
      store.addNodes(allNodes);
      store.setEdges((prev) => [...prev, ...newEdges]);
      store.setMode("storyboard");
      return;
    }

    if (payload.shots && payload.shots.length > 0) {
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
   * 生成单个段级导演板图。
   *
   * 输入来源（按优先级）：
   * 1. 入边收集：prompt(role=storyboard) → 04b 文本；prompt(role=system) → 系统提示词；
   *    referenceImage → 参考图（映射到 character/object/scene_ref，最多 3 张）
   * 2. 回退：无入边时用 segment 节点内嵌 storyboardText/systemPrompt + store.storyboardAssets（老项目兼容）
   */
  async function generateSegment(segmentNodeId: string): Promise<void> {
    const store = useCanvasStore.getState();
    if (!store.projectId) {
      store.updateNodeData(segmentNodeId, {
        status: "error",
        error: "未关联项目",
      } as Partial<SegmentNodeData>);
      return;
    }

    const segNode = store.nodes.find((n) => n.id === segmentNodeId);
    if (!segNode) return;
    const d = segNode.data as SegmentNodeData;

    // 按入边收集输入
    const inputs = collectSegmentInputs(segmentNodeId, store.nodes, store.edges);

    // 校验：既无入边故事板文本，也无内嵌 → 报错
    const finalStoryboard = inputs.storyboardText || d.storyboardText;
    if (!finalStoryboard.trim()) {
      store.updateNodeData(segmentNodeId, {
        status: "error",
        error: "请连线接入「故事板文本」节点，或节点内含 04b 文本",
      } as Partial<SegmentNodeData>);
      return;
    }

    setGeneratingIds((prev) => new Set(prev).add(segmentNodeId));
    store.updateNodeData(segmentNodeId, {
      status: "running",
      error: undefined,
    } as Partial<SegmentNodeData>);

    // 参考图优先级：入边 referenceImage > store.storyboardAssets（老项目兼容）
    const refUrls = inputs.contentRefs.length > 0
      ? inputs.contentRefs
      : [
          store.storyboardAssets.character?.url,
          store.storyboardAssets.object?.url,
          store.storyboardAssets.scene?.url,
        ].filter((u): u is string => !!u);

    try {
      const res = await segmentGenerateMutation.mutateAsync({
        projectId: store.projectId,
        body: {
          segments: [segmentNodeToInput({ id: segmentNodeId, data: d }, inputs)],
          // contentRefs 映射到 character/object/scene_ref（后端去重）
          character_ref: refUrls[0],
          object_ref: refUrls[1],
          scene_ref: refUrls[2],
          size: "1920x1920",
          model: d.model || undefined,
          concurrency: 1,
        },
      });

      const result = res.results?.[0];
      if (result?.status === "done" && result.result_image_url) {
        store.updateNodeData(segmentNodeId, {
          status: "done",
          resultImageUrl: result.result_image_url,
          error: undefined,
        } as Partial<SegmentNodeData>);
      } else {
        store.updateNodeData(segmentNodeId, {
          status: "error",
          error: result?.error ?? "生成失败",
        } as Partial<SegmentNodeData>);
      }
    } catch (e) {
      store.updateNodeData(segmentNodeId, {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      } as Partial<SegmentNodeData>);
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(segmentNodeId);
        return next;
      });
    }
  }

  /**
   * 批量生成所有 idle / error 状态的段级导演板图。
   *
   * 每个 segment 独立按入边收集输入，调一次段级批量 API（后端并发控制），按 node_id 回写状态。
   * 参考图：每段独立映射其入边 referenceImage；无入边则回退 store.storyboardAssets。
   */
  async function generateAllSegments(): Promise<void> {
    const store = useCanvasStore.getState();
    if (!store.projectId) return;

    const segNodes = selectSegmentNodes(store.nodes);
    const pending = segNodes.filter((n) => {
      const st = (n.data as SegmentNodeData).status;
      return st === "idle" || st === "error";
    });
    if (pending.length === 0) return;

    pending.forEach((n) => {
      store.updateNodeData(n.id, {
        status: "running",
        error: undefined,
      } as Partial<SegmentNodeData>);
    });
    setGeneratingIds(new Set(pending.map((n) => n.id)));

    // 每段独立收集入边输入 + 参考图映射
    const segmentPayloads = pending.map((n) => {
      const inputs = collectSegmentInputs(n.id, store.nodes, store.edges);
      return { node: n, inputs };
    });

    try {
      const res = await segmentGenerateMutation.mutateAsync({
        projectId: store.projectId,
        body: {
          segments: segmentPayloads.map(({ node, inputs }) =>
            segmentNodeToInput({ id: node.id, data: node.data as SegmentNodeData }, inputs),
          ),
          // 批量请求的参考图用 store.storyboardAssets 兜底（每段独立参考图在单段生成时用）
          character_ref: store.storyboardAssets.character?.url,
          object_ref: store.storyboardAssets.object?.url,
          scene_ref: store.storyboardAssets.scene?.url,
          size: "1920x1920",
          model: pending[0] && (pending[0].data as SegmentNodeData).model || undefined,
          concurrency: 3,
        },
      });

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
          } as Partial<SegmentNodeData>);
        } else {
          store.updateNodeData(n.id, {
            status: "error",
            error: r?.error ?? "生成失败",
          } as Partial<SegmentNodeData>);
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pending.forEach((n) => {
        store.updateNodeData(n.id, {
          status: "error",
          error: msg,
        } as Partial<SegmentNodeData>);
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
    generateSegment,
    generateAllSegments,
    composeStoryboard,
    isGenerating: generatingIds.size > 0,
    isGeneratePending:
      generateMutation.isPending || segmentGenerateMutation.isPending,
    isComposePending: composeMutation.isPending,
  };
}
