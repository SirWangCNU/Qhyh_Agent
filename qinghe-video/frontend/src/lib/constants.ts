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

/** LocalStorage 键名（与旧 HTML 版本完全保持兼容，便于书签/会话延续）。 */
export const STORAGE_KEYS = {
  token: "qinghe_token",
  user: "qinghe_user",
  sidebarCollapsed: "qinghe_sidebar_collapsed",
  plans: "qinghe_plans",
  pipeline: "qinghe_pipeline_state",
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

/** 前端路由表（hash 路由，与旧版兼容）。 */
export const ROUTES = {
  create: "/create",
  chat: "/chat",
  workshop: "/workshop",
  imageStudio: "/image-studio",
  agents: "/agents",
  plan: "/plan",
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
  { to: ROUTES.imageStudio, label: "图像工作室", route: ROUTES.imageStudio },
  { to: ROUTES.agents, label: "Agent 管理", route: ROUTES.agents },
];
