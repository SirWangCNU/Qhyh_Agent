/**
 * 生成编排 hook：收集生成节点的入边源节点 → 组装 GenerateRequest → 调后端 → 回写结果。
 *
 * 流程：
 * 1. 从 store 取 nodes/edges，找出生成节点的所有入边源节点。
 * 2. referenceImage 节点 → references[]（按 ref_type 分组由后端处理降级）。
 * 3. prompt 节点 → 文本片段（与生成节点内置 prompt 拼接）。
 * 4. 解析生成节点内置 prompt 中的 @ 引用 → 补充 references 并清洗提示词。
 * 5. 标记生成节点 running → 调 POST /generate → 成功则 updateNodeData(done) +
 *    addNode(结果图，带中文序号) + addEdgeRaw(generate→image)；失败则标记 error。
 */
import { useCanvasGenerateMutation } from "@/hooks/use-canvas";
import { useCanvasStore } from "@/stores/canvas-store";
import { makeImageNode } from "@/components/canvas/nodeFactory";
import { resolvePromptMentions } from "@/components/canvas/shared/promptMention";
import type { ReferenceInputDTO } from "@/hooks/use-canvas";
import type {
  GenerateNodeData,
  PromptNodeData,
  ReferenceImageNodeData,
} from "@/components/canvas/types";

/** 计算下一个结果图序号：当前画布 image 节点最大 index + 1。 */
function nextImageIndex(nodes: { data: { kind?: string; index?: number } }[]): number {
  let max = 0;
  for (const n of nodes) {
    if ((n.data as { kind?: string }).kind !== "image") continue;
    const idx = (n.data as { index?: number }).index ?? 0;
    if (idx > max) max = idx;
  }
  return max + 1;
}

/** 返回一个触发函数，传入生成节点 id。 */
export function useCanvasGenerate() {
  const generateMutation = useCanvasGenerateMutation();

  const runGenerate = async (generateNodeId: string) => {
    const state = useCanvasStore.getState();
    const { nodes, edges, projectId, updateNodeData, addNode, addEdgeRaw } =
      state;
    const genNode = nodes.find((n) => n.id === generateNodeId);
    if (!genNode) return;
    if (!projectId) {
      updateNodeData(generateNodeId, {
        status: "error",
        error: "未关联项目，无法生成",
      } as Partial<GenerateNodeData>);
      return;
    }

    const genData = genNode.data as GenerateNodeData;

    if (genData.mode === "video") {
      updateNodeData(generateNodeId, {
        status: "error",
        error: "视频生成暂未接入",
      } as Partial<GenerateNodeData>);
      return;
    }

    // 收集入边源节点
    const incomingNodes = edges
      .filter((e) => e.target === generateNodeId)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is NonNullable<typeof n> => !!n);

    // 1. 参考图（连线接入）
    const wiredReferences: ReferenceInputDTO[] = incomingNodes
      .filter((n) => (n.data as { kind: string }).kind === "referenceImage")
      .map((n) => {
        const d = n.data as ReferenceImageNodeData;
        return { image_url: d.imageUrl ?? "", ref_type: d.refType };
      })
      .filter((r) => r.image_url);

    // 2. 入边 prompt 节点文本片段
    const promptNodes = incomingNodes.filter(
      (n) => (n.data as { kind: string }).kind === "prompt",
    );
    const promptFragments = promptNodes
      .map((n) => (n.data as PromptNodeData).prompt)
      .filter(Boolean);

    // 3. 解析生成节点内置 prompt 中的 @ 引用
    const nodePrompt = genData.prompt ?? "";
    const { references: mentionRefs, cleanedPrompt } = resolvePromptMentions(
      nodePrompt,
      nodes,
    );

    // 合并参考图（去重 by url）
    const references: ReferenceInputDTO[] = [];
    const seenUrls = new Set<string>();
    for (const r of [...wiredReferences, ...mentionRefs]) {
      if (!r.image_url || seenUrls.has(r.image_url)) continue;
      seenUrls.add(r.image_url);
      references.push(r);
    }

    // 拼接最终提示词：清洗后的内置 prompt + 入边 prompt 片段
    const promptParts: string[] = [];
    if (cleanedPrompt.trim()) promptParts.push(cleanedPrompt.trim());
    if (promptFragments.length) promptParts.push(promptFragments.join("\n"));
    const finalPrompt = promptParts.join("\n") || "（无提示词）";

    const negativePrompt =
      (genData.negative_prompt ?? "").trim() || undefined;

    updateNodeData(generateNodeId, {
      status: "running",
      error: undefined,
    } as Partial<GenerateNodeData>);

    try {
      const res = await generateMutation.mutateAsync({
        projectId,
        body: {
          node_id: generateNodeId,
          references,
          prompt: finalPrompt,
          negative_prompt: negativePrompt,
          params: {
            size: genData.size,
            model: genData.model || undefined,
          },
        },
      });

      if (res.status === "done" && res.result_image_url) {
        updateNodeData(generateNodeId, {
          status: "done",
          error: undefined,
        } as Partial<GenerateNodeData>);
        // 计算下一个图片序号并创建结果图节点
        const idx = nextImageIndex(nodes);
        const { node: imageNode } = makeImageNode(
          res.result_image_url,
          genNode.position,
          generateNodeId,
          idx,
        );
        addNode(imageNode);
        addEdgeRaw({
          id: `e-${generateNodeId}-${imageNode.id}`,
          source: generateNodeId,
          target: imageNode.id,
          animated: true,
        });
      } else {
        updateNodeData(generateNodeId, {
          status: "error",
          error: res.error ?? "生成失败",
        } as Partial<GenerateNodeData>);
      }
    } catch (e) {
      updateNodeData(generateNodeId, {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      } as Partial<GenerateNodeData>);
    }
  };

  return { runGenerate, isPending: generateMutation.isPending };
}
