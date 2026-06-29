/**
 * 提示词 `@` 引用图片素材的序列化 / 解析工具。
 *
 * 引用占位符格式（唯一、可解析）：
 * - 结果图节点：`@图片一`、`@图片二`…（序号取自 ImageNodeData.index）
 * - 参考图节点：`@参考图一`、`@参考图二`…（按画布中出现顺序编号）
 *
 * 解析时把命中的占位符映射回节点 imageUrl，作为 references 传给后端生成接口；
 * 同时把占位符从提示词中替换为节点显示名，避免模型看到原始 token 产生歧义。
 */
import type { CanvasNode, RefType } from "@/components/canvas/types";
import { toChineseNumber } from "@/components/canvas/nodeFactory";
import type { ReferenceInputDTO } from "@/hooks/use-canvas";

/** 一条可被 `@` 引用的图片候选项。 */
export interface MentionCandidate {
  nodeId: string;
  kind: "image" | "referenceImage";
  /** 插入到提示词中的占位符，如 `@图片一`。 */
  mention: string;
  /** 下拉列表展示名，如「图片一」「参考图一 · 内容」。 */
  display: string;
  /** 缩略图 URL（可能为空）。 */
  imageUrl: string | null;
  /** 参考图维度（仅 referenceImage）。 */
  refType?: RefType;
}

const REF_TYPE_LABEL: Record<string, string> = {
  content: "内容",
  style: "风格",
  structure: "结构",
  pose: "姿态",
};

/** 从画布节点构建 `@` 引用候选项列表。 */
export function buildMentionCandidates(nodes: CanvasNode[]): MentionCandidate[] {
  const candidates: MentionCandidate[] = [];
  let refOrdinal = 0;
  // 结果图按 index 升序
  const imageNodes = nodes
    .filter((n) => (n.data as { kind?: string }).kind === "image")
    .sort(
      (a, b) =>
        ((a.data as { index?: number }).index ?? 0) -
        ((b.data as { index?: number }).index ?? 0),
    );
  for (const n of imageNodes) {
    const d = n.data as {
      kind: "image";
      imageUrl: string | null;
      index?: number;
      label?: string;
    };
    const idx = d.index ?? 0;
    if (idx < 1 || !d.imageUrl) continue;
    const cn = toChineseNumber(idx);
    candidates.push({
      nodeId: n.id,
      kind: "image",
      mention: `@图片${cn}`,
      display: `图片${cn}`,
      imageUrl: d.imageUrl,
    });
  }
  // 参考图按画布出现顺序编号
  for (const n of nodes) {
    if ((n.data as { kind?: string }).kind !== "referenceImage") continue;
    const d = n.data as {
      kind: "referenceImage";
      imageUrl: string | null;
      refType?: RefType;
      label?: string;
    };
    if (!d.imageUrl) continue;
    refOrdinal += 1;
    const cn = toChineseNumber(refOrdinal);
    const refType: RefType = d.refType ?? "content";
    const refLabel = REF_TYPE_LABEL[refType] ?? refType;
    candidates.push({
      nodeId: n.id,
      kind: "referenceImage",
      mention: `@参考图${cn}`,
      display: `参考图${cn} · ${refLabel}`,
      imageUrl: d.imageUrl,
      refType,
    });
  }
  return candidates;
}

/** 匹配提示词中所有 `@图片X` / `@参考图X` 占位符。 */
const MENTION_REGEX = /@(图片|参考图)([零一二三四五六七八九十百]+)/g;

export interface ResolvedMentions {
  /** 解析出的参考图列表，可直接作为生成请求 references。 */
  references: ReferenceInputDTO[];
  /** 占位符被替换为显示名后的提示词（传给模型）。 */
  cleanedPrompt: string;
  /** 未匹配到节点的占位符（保留为普通文本）。 */
  unresolved: string[];
}

/** 解析提示词中的 `@` 占位符，映射为 references 并清洗提示词。 */
export function resolvePromptMentions(
  prompt: string,
  nodes: CanvasNode[],
): ResolvedMentions {
  const candidates = buildMentionCandidates(nodes);
  // mention → candidate
  const byMention = new Map(candidates.map((c) => [c.mention, c]));
  const references: ReferenceInputDTO[] = [];
  const unresolved: string[] = [];
  const seenUrls = new Set<string>();

  const cleaned = prompt.replace(MENTION_REGEX, (full) => {
    const cand = byMention.get(full);
    if (!cand || !cand.imageUrl) {
      unresolved.push(full);
      return full;
    }
    if (!seenUrls.has(cand.imageUrl)) {
      seenUrls.add(cand.imageUrl);
      references.push({
        image_url: cand.imageUrl,
        ref_type: cand.kind === "referenceImage" ? (cand.refType ?? "content") : "content",
      });
    }
    return cand.display;
  });

  return { references, cleanedPrompt: cleaned, unresolved };
}
