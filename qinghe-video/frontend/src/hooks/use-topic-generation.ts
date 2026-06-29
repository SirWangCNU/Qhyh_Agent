import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import type { TopicRequest, TopicResponse } from "@/types/api";

/**
 * AI 爆款选题 hook（POST /api/topics/generate）。
 *
 * 输入「产品名 + 一句话创意」，返回多个差异化的爆款主题候选，
 * 供用户在工坊策划步骤选择后回填为一句话创意。
 */
export function useTopicGeneration() {
  return useMutation({
    mutationFn: (req: TopicRequest) =>
      apiPost<TopicResponse>("/api/topics/generate", req),
  });
}
