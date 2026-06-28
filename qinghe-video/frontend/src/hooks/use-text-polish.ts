import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import type { PolishRequest, PolishResponse } from "@/types/api";

/**
 * AI 一句话润写 hook（POST /api/text/polish）。
 *
 * 输入「产品名 + 一句话创意」，返回补全后的完整 UserInput 字段
 * （产地/品类/卖点等），供工坊 planner 步骤直接消费。
 */
export function useTextPolish() {
  return useMutation({
    mutationFn: (req: PolishRequest) =>
      apiPost<PolishResponse>("/api/text/polish", req),
  });
}
