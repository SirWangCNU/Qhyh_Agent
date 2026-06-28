import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS } from "@/lib/constants";
import type { Plan } from "@/types/api";

/**
 * 方案历史 hook —— LocalStorage CRUD（key: qinghe_plans）。
 * 与旧版 sidebar.js / chat.js 行为兼容。
 */
export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>(() => loadPlans());

  // 监听其它 tab 同步
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEYS.plans) setPlans(loadPlans());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: Plan[]) => {
    setPlans(next);
    try {
      localStorage.setItem(STORAGE_KEYS.plans, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  /** 新建空方案，返回新 plan。 */
  const createPlan = useCallback((): Plan => {
    const plan: Plan = {
      id: `plan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: "未命名方案",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    persist([plan, ...plans]);
    return plan;
  }, [plans, persist]);

  /** 更新指定方案。 */
  const updatePlan = useCallback(
    (id: string, patch: Partial<Plan>) => {
      const next = plans.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
      );
      persist(next);
    },
    [plans, persist],
  );

  /** 删除指定方案。 */
  const removePlan = useCallback(
    (id: string) => {
      persist(plans.filter((p) => p.id !== id));
    },
    [plans, persist],
  );

  /** 按 id 查找。 */
  const getPlan = useCallback(
    (id: string | null | undefined) => plans.find((p) => p.id === id) ?? null,
    [plans],
  );

  return { plans, createPlan, updatePlan, removePlan, getPlan, refresh: () => setPlans(loadPlans()) };
}

function loadPlans(): Plan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.plans);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Plan[];
    if (parsed && typeof parsed === "object") {
      return Object.keys(parsed).map((k) => (parsed as Record<string, Plan>)[k]);
    }
    return [];
  } catch {
    return [];
  }
}
