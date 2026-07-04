/**
 * 集中清理用户相关的本地状态。
 *
 * 用于登出、登录切换、401 自动登出场景，确保新用户不会继承前一个用户的
 * workshop / canvas / pipeline 状态与 react-query 缓存。
 *
 * 各 store 的 reset() 内部会清除对应 sessionStorage key：
 * - workshop-store.reset() → 清 STORAGE_KEYS.workshop + workshopSession
 * - pipeline-store.reset() → 清 STORAGE_KEYS.pipeline
 * - canvas-store.reset() → 清 canvas session 指针
 *
 * 注意：本函数不清 auth-store 的 token/user，由调用方（auth-store.logout）
 * 在合适时机自行清理，避免循环依赖。
 */
import { queryClient } from "@/lib/queryClient";
import { useWorkshopStore } from "@/stores/workshop-store";
import { usePipelineStore } from "@/stores/pipeline-store";
import { useCanvasStore } from "@/stores/canvas-store";

export function clearAllUserData(): void {
  // 1. 重置各业务 store 内存状态 + 清对应 sessionStorage
  useWorkshopStore.getState().reset();
  usePipelineStore.getState().reset();
  useCanvasStore.getState().reset();
  // 2. 清空 react-query 所有缓存（列表/详情/查询），防止命中前一个用户数据
  queryClient.clear();
}
