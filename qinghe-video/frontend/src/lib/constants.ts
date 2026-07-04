/**
 * 全局常量：后端地址、LocalStorage 键、Agent 节点元信息、路由表。
 */

/**
 * 后端地址。
 * - 开发模式：Vite proxy 把 /api /outputs 转发到 :18739，所以前端直接用相对路径 ""。
 * - 生产模式：FastAPI 直接 serve 前端 dist/，前后端同源，仍用 ""。
 * - 自定义场景：通过 VITE_BACKEND_URL 环境变量注入完整 URL（例如 https://api.example.com）。
 */
export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "") || "";

/** LocalStorage / sessionStorage 键名（与旧 HTML 版本完全保持兼容，便于书签/会话延续）。 */
export const STORAGE_KEYS = {
  token: "qinghe_token",
  user: "qinghe_user",
  sidebarCollapsed: "qinghe_sidebar_collapsed",
  plans: "qinghe_plans",
  pipeline: "qinghe_pipeline_state",
  /** 工坊运行时状态快照（sessionStorage，刷新可恢复当前会话）。 */
  workshop: "qinghe_workshop_state",
  /** 工坊会话指针（sessionStorage，仅存 sessionId/name，完整 state 由后端负责）。 */
  workshopSession: "qinghe_workshop_session",
  /** 无限画布会话（sessionStorage，仅存 projectId/name）。 */
  canvas: "qinghe_canvas_session",
} as const;

/** Agent 节点顺序（与后端 main.py 中 NODE_ORDER 一致）。 */
export const NODE_ORDER = [
  "planner",
  "copywriter",
  "scriptwriter",
  "visual_designer",
  "distributor",
  "report_generator",
] as const;

export type NodeKey = (typeof NODE_ORDER)[number];

/** Agent 节点展示元信息。 */
export const NODE_META: Record<
  NodeKey,
  { label: string; emoji: string; kicker: string; desc: string }
> = {
  planner: {
    label: "策划",
    emoji: "📋",
    kicker: "PLANNER",
    desc: "主题、受众、卖点",
  },
  copywriter: {
    label: "文案",
    emoji: "✍️",
    kicker: "COPYWRITER",
    desc: "Hook、口播、CTA",
  },
  scriptwriter: {
    label: "脚本",
    emoji: "🎬",
    kicker: "SCRIPTWRITER",
    desc: "分镜、运镜、BGM",
  },
  visual_designer: {
    label: "视觉",
    emoji: "🎨",
    kicker: "VISUAL DESIGNER",
    desc: "图片 / 视频 Prompt",
  },
  distributor: {
    label: "投放",
    emoji: "📣",
    kicker: "DISTRIBUTOR",
    desc: "标题、标签、策略",
  },
  report_generator: {
    label: "报告",
    emoji: "📄",
    kicker: "REPORT",
    desc: "汇总成完整方案",
  },
};

// ============================================================
// 工坊 4 步流水线定义
// ============================================================

/** 工坊步骤 key（扩展自 NodeKey，增加一致性生图） */
export type WorkshopStepKey = NodeKey | "consistency_images";

/** 工坊步骤执行类型 */
export type WorkshopStepType = "llm" | "image";

/** 工坊步骤配置 */
export interface WorkshopStepConfig {
  key: WorkshopStepKey;
  num: number;
  title: string;
  emoji: string;
  kicker: string;
  desc: string;
  /** 卡片网格占位：1 = 单列，2 = 横跨两列 */
  gridSpan: 1 | 2;
  /** 卡片内副标题提示（更面向用户） */
  description?: string;
  type: WorkshopStepType;
  deps: WorkshopStepKey[];
  defaultAuto: boolean;
}

/** 4 步工坊流水线定义 */
export const WORKSHOP_STEPS: WorkshopStepConfig[] = [
  { key: "planner", num: 1, title: "策划", emoji: "📋", kicker: "PLANNER", desc: "输入产品名 → AI 润写 → 完整策划", gridSpan: 1, description: "输入产品名称，AI 润写后生成完整策划", type: "llm", deps: [], defaultAuto: true },
  { key: "copywriter", num: 2, title: "文案", emoji: "✍️", kicker: "COPYWRITER", desc: "Hook、口播、CTA", gridSpan: 1, description: "基于策划生成 Hook、口播稿与 CTA", type: "llm", deps: ["planner"], defaultAuto: true },
  { key: "consistency_images", num: 3, title: "一致性生图", emoji: "🧬", kicker: "CONSISTENCY", desc: "人物/物品/场景参考图", gridSpan: 2, description: "生成人物设定集、物品九宫格、场景四面环视图，保证主体一致性", type: "image", deps: ["copywriter"], defaultAuto: false },
  { key: "scriptwriter", num: 4, title: "脚本", emoji: "🎬", kicker: "SCRIPTWRITER", desc: "分镜、运镜、BGM", gridSpan: 2, description: "输出完整分镜表、运镜与 BGM 建议", type: "llm", deps: ["copywriter"], defaultAuto: true },
];

/** 默认自动执行到第几步（脚本完成；num 4 = scriptwriter，跳过 num 3 一致性生图） */
export const DEFAULT_AUTO_RUN_TO = 4;

/** 前端路由表（hash 路由，与旧版兼容）。 */
export const ROUTES = {
  create: "/create",
  chat: "/chat",
  workshop: "/workshop",
  canvas: "/canvas",
  plan: "/plan",
  assets: "/assets",
} as const;

/** 顶部导航链接配置。 */
export const NAV_LINKS: Array<{
  to: string;
  label: string;
  route: (typeof ROUTES)[keyof typeof ROUTES];
}> = [
  { to: ROUTES.create, label: "开始创作", route: ROUTES.create },
  { to: ROUTES.chat, label: "对话创作", route: ROUTES.chat },
  { to: ROUTES.workshop, label: "分步工坊", route: ROUTES.workshop },
  { to: ROUTES.canvas, label: "无限画布", route: ROUTES.canvas },
  { to: ROUTES.assets, label: "我的资产", route: ROUTES.assets },
];
