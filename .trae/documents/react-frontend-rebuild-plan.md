# 青禾映画 · React 前端重构方案

## 摘要 (Summary)

将现有 `qinghe-video/frontend/` 下的原生 HTML + 多 JS 模块前端，整体重构为 **React 18 + Vite + TypeScript** 项目。技术栈：**shadcn/ui + Tailwind CSS + Zustand + TanStack Query + Framer Motion + React Hook Form + Zod + React Router v6**。保留后端 FastAPI 接口与 SSE 流式协议完全不变，保留现有「编辑式有机风」暖米纸色主题。本文档决策完整，执行者可直接依此实施，无需再做技术选型。

---

## 当前状态分析 (Current State Analysis)

### 后端 API（保持不变，仅调整静态文件挂载路径）
- 端口：`18739`（默认）
- 鉴权：JWT，token 存 `localStorage.qinghe_token`；接口 `/api/auth/login`、`/api/auth/register`
- SSE 流式生成：`POST /api/generate/stream`，事件类型 `start` / `node_start` / `node_update` / `error` / `complete`
- 其它接口：`/api/health`、`/api/agents/{step}`、`/api/images/generate`、`/api/videos/generate`、`/api/tts/generate`、`/api/video/compose`、`/api/video/mvp`、`/api/image-studio/*`
- 所有 `/api/*` 业务接口需 `Authorization: Bearer <token>` 头

### 现有前端结构（将被替换）
- `frontend/index.html` — 单页 SPA，含 7 个 `<section class="page-section">` 区块
- `frontend/assets/css/` — 7 个 CSS 文件（`style.css` 定义设计令牌）
- `frontend/assets/js/` — 14 个 JS 模块（`app.js` / `router.js` / `pipeline.js` / `sidebar.js` / `auth.js` / `chat.js` / `form.js` / `workshop.js` / `image-studio.js` / `agents.js` / `plan.js` / `result.js` / `agent-renderers.js` / `video-compose-ui.js`）
- 哈希路由：`#/create` / `#/chat` / `#/workshop` / `#/image-studio` / `#/agents` / `#/plan`
- LocalStorage 键：`qinghe_token`、`qinghe_user`、`qinghe_sidebar_collapsed`、`qinghe_plans`

### 设计系统令牌（来自 [style.css](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/css/style.css) L7-L41）
| 令牌 | 值 | 用途 |
|---|---|---|
| `--color-bg` | `#f5f1e8` | 暖米纸背景 |
| `--color-bg-alt` | `#fbf8f1` | 卡片暖白 |
| `--color-surface` | `#ffffff` | 纯白卡片 |
| `--color-ink` | `#1f1f1f` | 炭黑主文字 |
| `--color-ink-soft` | `#6b6357` | 暖灰次文字 |
| `--color-ink-faint` | `#a39c8e` | 极淡灰 |
| `--color-brand` | `#3d5a3d` | 深森林绿 |
| `--color-brand-deep` | `#2d4a2b` | 更深绿 |
| `--color-accent` | `#c9a961` | 麦穗金 |
| `--color-warn` | `#b85c38` | 陶土橙 |
| `--color-success` | `#7b9e5b` | 鼠尾草绿 |
| `--color-border` | `#e8e2d5` | 边框暖灰 |

字体：`Fraunces`（display 衬线）/ `DM Sans`（body）/ `JetBrains Mono`（mono），通过 Google Fonts 引入。

### 已知约束
- `AGENTS.md` 要求每个文件 < 500 行；超长需拆分
- 静态文件挂载点：[main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) L75-L79 当前指向 `frontend/assets/`，需调整为 `frontend/dist/assets/`
- SPA 路由 `/chat` `/plan` `/agents` 当前各自返回 index.html（[main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) L100-L108），需扩展到所有 React Router 路径

---

## 假设与决策 (Assumptions & Decisions)

| 项 | 决策 |
|---|---|
| 框架 | React 18.3 + Vite 5 + TypeScript 5 |
| 路由 | `react-router-dom@6`（`createHashRouter`，保持 URL hash 兼容现有书签） |
| 组件库 | `shadcn/ui`（Radix UI + Tailwind），组件代码内联到 `src/components/ui/` |
| CSS | Tailwind CSS 3.4 + CSS 变量（保留原设计令牌）；用 `@theme` 将令牌映射到 Tailwind 颜色 |
| 状态管理 | `zustand@4`（auth、ui、pipeline 三个 store） |
| 数据请求 | `@tanstack/react-query@5`（健康检查、单步 Agent、图片/视频/TTS）；SSE 用自写 hook |
| 表单 | `react-hook-form@7` + `zod@3` + `@hookform/resolvers` |
| 动画 | `framer-motion@11`（边栏伸缩、列表淡入、按钮悬停） |
| 项目位置 | **直接替换 `qinghe-video/frontend/`**，旧文件备份到 `frontend/_legacy-html/` |
| 后端改动 | 仅修改 [main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py) L75-L108：静态目录改为 `frontend/dist/assets`，所有 SPA 路由 catch-all 返回 `dist/index.html` |
| 开发模式 | `npm run dev`（Vite :5173）+ `uvicorn`（:18739）并行；Vite 配置 `server.proxy` 把 `/api` 转发到 :18739 |
| 生产模式 | `npm run build` → `frontend/dist/` → FastAPI 直接 serve |

---

## 实施步骤 (Proposed Changes)

### 阶段 0：备份旧前端（保险）

将 `qinghe-video/frontend/` 下除 `assets/`、`index.html` 外无其它内容，整体移动到 `qinghe-video/frontend/_legacy-html/`：

```
qinghe-video/frontend/_legacy-html/
├── index.html
└── assets/{css,js}/
```

> 仅为对照参考，不参与构建。如需清理可在重构验证完毕后删除。

### 阶段 1：项目脚手架与文件目录结构

#### 1.1 创建 Vite + React + TS 项目

在 `qinghe-video/frontend/` 根目录创建以下文件（不使用 `npm create vite` 交互命令，直接 `Write` 文件以保证可控）：

**`qinghe-video/frontend/package.json`**
```json
{
  "name": "qinghe-video-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.1",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.2",
    "@tanstack/react-query": "^5.62.7",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^11.15.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.54.2",
    "react-router-dom": "^6.28.0",
    "tailwind-merge": "^2.5.5",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.24.1",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^5.4.11"
  }
}
```

**`qinghe-video/frontend/vite.config.ts`**
```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发时把 /api 请求代理到 FastAPI :18739，避免跨域
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:18739", changeOrigin: true },
      "/outputs": { target: "http://localhost:18739", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
```

**`qinghe-video/frontend/tsconfig.json`**（含 `@/*` 路径别名）
**`qinghe-video/frontend/tsconfig.node.json`**
**`qinghe-video/frontend/tailwind.config.ts`**（将设计令牌映射为 Tailwind 颜色，见 1.3）
**`qinghe-video/frontend/postcss.config.js`**
**`qinghe-video/frontend/components.json`**（shadcn/ui 配置，style=default，baseColor=stone，cssVariables=true）
**`qinghe-video/frontend/.gitignore`**（`node_modules`、`dist`）
**`qinghe-video/frontend/index.html`**（Vite 入口，仅 `<div id="root">` + Google Fonts 链接 + `/src/main.tsx`）

#### 1.2 完整目录结构

```
qinghe-video/frontend/
├── _legacy-html/                    # 旧前端备份（阶段 0）
├── index.html                       # Vite 入口
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.js
├── components.json                  # shadcn/ui 配置
├── .gitignore
└── src/
    ├── main.tsx                     # React 挂载入口（Router + QueryClient + TooltipProvider）
    ├── App.tsx                      # 路由根（HashRouter + AppLayout + Routes）
    ├── index.css                    # Tailwind base + CSS 变量 + 全局纸张噪点
    ├── lib/
    │   ├── utils.ts                 # cn() 函数（clsx + tailwind-merge）
    │   ├── api.ts                   # fetch 封装：自动注入 Bearer token、401 自动登出
    │   ├── sse.ts                   # parseSSEStream()（移植自旧 app.js L55-L101）
    │   └── constants.ts             # NODE_ORDER、STORAGE_KEYS、BACKEND_URL、路由表
    ├── types/
    │   ├── api.ts                   # UserInput、GenerateResult、AgentOutput、SSEEvent 等
    │   └── index.ts
    ├── stores/
    │   ├── auth-store.ts            # Zustand: token, user, login(), logout(), hydrate()
    │   ├── ui-store.ts              # Zustand: sidebarCollapsed, toggleSidebar(), activeRoute
    │   └── pipeline-store.ts        # Zustand: nodes 状态、currentNode、error、finalResult、reset()
    ├── hooks/
    │   ├── use-health.ts            # useHealth() — TanStack Query 每 30s 轮询 /api/health
    │   ├── use-auth.ts              # useLogin(), useRegister() — mutation + Zod schema
    │   ├── use-generate-stream.ts   # useGenerateStream() — SSE 流式生成 + 状态写 pipeline-store
    │   ├── use-plans.ts             # usePlans() — LocalStorage CRUD（qinghe_plans）
    │   ├── use-sidebar.ts           # useSidebar() — 选择 store 字段 + 暴露动作
    │   └── use-reveal.ts            # useReveal(ref) — IntersectionObserver + Framer Motion 变体
    ├── components/
    │   ├── ui/                      # shadcn/ui 原子组件
    │   │   ├── button.tsx
    │   │   ├── input.tsx
    │   │   ├── label.tsx
    │   │   ├── textarea.tsx
    │   │   ├── select.tsx
    │   │   ├── card.tsx
    │   │   ├── badge.tsx
    │   │   ├── skeleton.tsx
    │   │   ├── tabs.tsx
    │   │   └── dialog.tsx
    │   ├── layout/                  # 核心布局（阶段 2 重点）
    │   │   ├── AppLayout.tsx        # 根布局：<Sidebar/> + <div class="site-body"><Header/><main/><Footer/></div>
    │   │   ├── Sidebar.tsx          # 第一个关键组件（阶段 3 重点）
    │   │   ├── SidebarHeader.tsx    # 折叠按钮 + 品牌 mark
    │   │   ├── SidebarProgress.tsx  # 流水线进度（PipelineFlow + 进度条 + 状态行）
    │   │   ├── SidebarPlanList.tsx  # 方案历史列表
    │   │   ├── Header.tsx           # 顶部导航 + 品牌 trigger + 健康状态 + 登出
    │   │   ├── HealthPill.tsx       # 后端在线/离线指示
    │   │   └── Footer.tsx           # 页脚品牌 + 链接列
    │   ├── auth/
    │   │   └── AuthOverlay.tsx      # 登录/注册遮罩（RHF + Zod）
    │   ├── pipeline/
    │   │   ├── PipelineFlow.tsx     # 6 节点视觉流
    │   │   └── PipelineNode.tsx     # 单节点（active/done/error 状态）
    │   └── shared/
    │       ├── WheatMark.tsx        # 青禾品牌 SVG（麦穗）
    │       ├── Reveal.tsx           # 滚动入场动画包装（Framer Motion）
    │       └── Logo.tsx             # 品牌 logo + 文字
    ├── pages/
    │   ├── CreatePage.tsx           # #/create（Hero + 案例展示）— 阶段 4 之后
    │   ├── ChatPage.tsx             # #/chat
    │   ├── WorkshopPage.tsx         # #/workshop
    │   ├── ImageStudioPage.tsx      # #/image-studio
    │   ├── AgentsPage.tsx           # #/agents
    │   └── PlanPage.tsx             # #/plan
    ├── routes/
    │   └── index.tsx                # 路由配置（createHashRouter）
    └── assets/
        └── fonts/                   # （可选）本地字体回退
```

#### 1.3 设计令牌迁移（Tailwind + CSS 变量）

**`src/index.css`** 顶部 `:root` 直接复用 [style.css](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/css/style.css) L7-L41 的变量名，再额外定义 shadcn/ui 所需的 HSL 变量：

```css
:root {
  /* 原设计令牌（保留同名 CSS 变量，便于心智迁移） */
  --color-bg: #f5f1e8;
  --color-bg-alt: #fbf8f1;
  --color-surface: #ffffff;
  --color-ink: #1f1f1f;
  --color-ink-soft: #6b6357;
  --color-ink-faint: #a39c8e;
  --color-brand: #3d5a3d;
  --color-brand-deep: #2d4a2b;
  --color-accent: #c9a961;
  --color-accent-soft: #e8d9b0;
  --color-warn: #b85c38;
  --color-success: #7b9e5b;
  --color-border: #e8e2d5;

  /* shadcn/ui HSL 变量（映射到上述色） */
  --background: 42 36% 94%;          /* #f5f1e8 */
  --foreground: 0 0% 12%;            /* #1f1f1f */
  --card: 40 47% 98%;                /* #fbf8f1 */
  --primary: 120 22% 30%;            /* #3d5a3d */
  --primary-foreground: 40 47% 98%;
  --secondary: 40 33% 90%;
  --muted: 40 16% 60%;               /* #6b6357 */
  --muted-foreground: 40 12% 65%;    /* #a39c8e */
  --accent: 36 47% 59%;              /* #c9a961 */
  --accent-foreground: 0 0% 12%;
  --destructive: 17 49% 48%;         /* #b85c38 */
  --border: 42 28% 89%;              /* #e8e2d5 */
  --ring: 120 22% 30%;
  --radius: 0.5rem;
}
```

`tailwind.config.ts` 的 `theme.extend.colors` 同时引用两边：`brand: "var(--color-brand)"` 与 `background: "hsl(var(--background))"`，确保旧类名 `text-[color:var(--color-brand)]` 与新类名 `text-primary` 都能用。

#### 1.4 后端最小改动

修改 [main.py](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/src/main.py)：

- L75 `_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"` → 末尾追加 `/ "dist"`（指向构建产物）
- L76 `_FRONTEND_ASSETS = _FRONTEND_DIR / "assets"` 保持不变（dist 下会有 assets）
- L91-L108 `index()` 与 `spa_routes()` 合并改造：增加 `/create`、`/workshop`、`/image-studio` 路由；并增加 catch-all 通配 `/{path:path}` 返回 `dist/index.html`，支持 React Router 任意的深层路径
- 兼容性：开发模式下不依赖 FastAPI serve 前端，Vite dev server 直接代理 `/api`，所以后端改动只影响生产部署

### 阶段 2：核心布局 (Layout) 实现

#### 2.1 `src/lib/constants.ts`

集中所有常量：
```ts
export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/+$/, "") || "";

export const STORAGE_KEYS = {
  token: "qinghe_token",
  user: "qinghe_user",
  sidebarCollapsed: "qinghe_sidebar_collapsed",
  plans: "qinghe_plans",
  pipeline: "qinghe_pipeline_state",
} as const;

export const NODE_ORDER = [
  "planner", "copywriter", "scriptwriter",
  "visual_designer", "distributor", "report_generator",
] as const;

export const NODE_META: Record<string, { label: string; emoji: string; kicker: string }> = {
  planner:         { label: "策划", emoji: "📋", kicker: "PLANNER" },
  copywriter:      { label: "文案", emoji: "✍️", kicker: "COPYWRITER" },
  scriptwriter:    { label: "脚本", emoji: "🎬", kicker: "SCRIPTWRITER" },
  visual_designer: { label: "视觉", emoji: "🎨", kicker: "VISUAL DESIGNER" },
  distributor:     { label: "投放", emoji: "📣", kicker: "DISTRIBUTOR" },
  report_generator:{ label: "报告", emoji: "📄", kicker: "REPORT" },
};

export const ROUTES = {
  create: "#/create",
  chat: "#/chat",
  workshop: "#/workshop",
  imageStudio: "#/image-studio",
  agents: "#/agents",
  plan: "#/plan",
} as const;
```

#### 2.2 `src/stores/ui-store.ts`

```ts
interface UIState {
  sidebarCollapsed: boolean;
  activeRoute: string;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setActiveRoute: (r: string) => void;
  hydrate: () => void;
}
```
- 初次 `hydrate()` 从 `localStorage.qinghe_sidebar_collapsed` 读取（默认折叠，与旧版一致，见 [sidebar.js](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/sidebar.js) L52-L60）
- `toggleSidebar()` 同步写回 localStorage

#### 2.3 `src/stores/auth-store.ts`

```ts
interface AuthState {
  token: string | null;
  user: { username: string; role: string } | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: { username: string; role: string }) => void;
  logout: () => void;
  hydrate: () => void;
}
```
- `hydrate()` 从 `localStorage.qinghe_token` + `qinghe_user` 恢复
- `logout()` 清两个键

#### 2.4 `src/lib/api.ts`

封装 `apiFetch()`：
- 自动注入 `Authorization: Bearer <token>`（来自 `auth-store`）
- 401 → 调用 `logout()` 并触发 `AuthOverlay` 显示
- 暴露 `apiGet`、`apiPost`、`apiPostSSE`（后者返回 `ReadableStream`）

#### 2.5 `src/components/layout/AppLayout.tsx`

```tsx
export function AppLayout() {
  const isAuthed = useAuthStore(s => s.isAuthenticated);
  return (
    <>
      <AnimatePresence>{!isAuthed && <AuthOverlay />}</AnimatePresence>
      <div className="site-wrapper flex">
        <Sidebar />
        <div className="site-body flex-1 min-w-0">
          <Header />
          <main className="min-h-[calc(100vh-64px-200px)]">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
}
```

#### 2.6 `src/components/layout/Header.tsx`

复刻 [index.html](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html) L111-L133 的结构：
- `<WheatMark />` + 品牌名作为 `brand-trigger`（点击触发 `useSidebar().toggle()`）
- `<nav className="site-nav">` 内 5 个 `<NavLink>`：开始创作 / 对话创作 / 分步工坊 / 图像工作室 / Agent 管理
- `<HealthPill />`（订阅 `useHealth()`）
- 登出按钮（仅 authed 显示）

#### 2.7 `src/components/layout/HealthPill.tsx`

- 调用 `useHealth()`：TanStack Query `useQuery`，`queryKey: ["health"]`，`refetchInterval: 30000`
- 状态映射：`online` → 绿点 + "后端在线"；`offline` → 红点 + "后端离线"；`checking` → 灰点 + "检测中"
- 加载时显示 `<Skeleton className="h-6 w-20" />`（满足"骨架屏"要求）

#### 2.8 `src/components/layout/Footer.tsx`

复刻 [index.html](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html) L572-L613。三栏 grid：品牌+说明 / 分步工坊链接 / 说明链接。底部 `footer-bottom` 版权行。

### 阶段 3：第一个关键组件 — `<Sidebar />`

> 这是用户重点关注的组件，必须实现完整的可访问性、动画、状态管理。

#### 3.1 文件：`src/components/layout/Sidebar.tsx`

**职责**：左侧可折叠边栏，包含折叠按钮、新建方案 FAB、流水线进度、方案历史列表。

**结构**（对应旧 [index.html](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html) L75-L104）：

```tsx
export function Sidebar() {
  const collapsed = useUIStore(s => s.sidebarCollapsed);
  const toggle    = useUIStore(s => s.toggleSidebar);
  return (
    <motion.aside
      layout
      initial={false}
      animate={{ width: collapsed ? 64 : 280 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "site-sidebar shrink-0 h-screen sticky top-0 z-40",
        "bg-[var(--color-bg-alt)] border-r border-[var(--color-border)]",
        "flex flex-col gap-3 py-4 overflow-hidden",
      )}
      aria-label="方案边栏"
      aria-expanded={!collapsed}
    >
      <SidebarHeader collapsed={collapsed} onToggle={toggle} />
      <SidebarNewPlan collapsed={collapsed} />
      <SidebarProgress collapsed={collapsed} />
      <SidebarPlanList collapsed={collapsed} />
    </motion.aside>
  );
}
```

**关键交互**：
1. **Framer Motion `layout` + `animate.width`**：边栏宽度从 64px ↔ 280px 平滑过渡（替代旧 CSS class 切换）
2. **点击外部关闭**：用 `useEffect` + `document.addEventListener("click")`，判断点击是否在 sidebar / brandTrigger / toggleBtn 之外，若是则自动折叠（移植自 [sidebar.js](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/assets/js/sidebar.js) L236-L244）
3. **可访问性**：
   - `aria-expanded` 反映折叠状态
   - 折叠按钮 `aria-label="展开/收起边栏"`
   - 折叠状态下，方案列表项仍可键盘 Tab 访问，但文字 `sr-only` 隐藏
   - `Esc` 键可关闭展开的边栏
4. **持久化**：折叠状态写入 `localStorage.qinghe_sidebar_collapsed`

#### 3.2 子组件 `SidebarHeader.tsx`

```tsx
export function SidebarHeader({ collapsed, onToggle }: Props) {
  return (
    <div className="sidebar__header px-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "展开边栏" : "收起边栏"}
        title={collapsed ? "展开边栏" : "收起边栏"}
        className="sidebar__toggle mx-auto grid h-10 w-10 place-items-center rounded-md hover:bg-[var(--color-secondary)] transition-transform hover:scale-105 active:scale-95"
      >
        <Menu size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
```
> 图标改用 `lucide-react` 的 `<Menu />`，避免内联 SVG 重复。

#### 3.3 子组件 `SidebarNewPlan.tsx`

FAB 按钮 + 「新建方案」标签。点击 → 调用 `usePlans().createPlan()` + 导航到 `#/chat`。

#### 3.4 子组件 `SidebarProgress.tsx`

显示当前生成任务的流水线进度：
- 仅当 `pipeline-store.currentTaskId` 存在时渲染
- 内含 `<PipelineFlow />`（6 节点）+ 进度条 + 状态行
- 进度条用 Framer Motion `motion.div` + `animate={{ width: \`${ratio * 100}%\` }}`

#### 3.5 子组件 `SidebarPlanList.tsx`

- 调用 `usePlans()`：从 `localStorage.qinghe_plans` 读取 + 写入
- 列表项用 `<motion.button layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>` 实现淡入升起
- 点击 → 导航 `#/chat?planId=xxx` 并触发 `useChatStore().loadPlan(id)`
- 空状态：显示 `<div className="sidebar__empty text-muted-foreground text-xs">暂无方案</div>`
- 折叠状态下：列表项只显示首字图标，文字 `hidden`

#### 3.6 自定义 Hook `useSidebar.ts`

```ts
export function useSidebar() {
  const collapsed = useUIStore(s => s.sidebarCollapsed);
  const toggle    = useUIStore(s => s.toggleSidebar);
  const setCollapsed = useUIStore(s => s.setSidebarCollapsed);
  // 点击外部关闭
  useEffect(() => {
    if (collapsed) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-sidebar]") && !t.closest("[data-brand-trigger]")) {
        setCollapsed(true);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [collapsed, setCollapsed]);
  // Esc 关闭
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !collapsed) setCollapsed(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);
  return { collapsed, toggle, setCollapsed };
}
```

#### 3.7 品牌 mark：`src/components/shared/WheatMark.tsx`

抽离 [index.html](file:///d:/GitHubProgram/Qhyh_Agent/qinghe-video/frontend/index.html) L294-L316 的麦穗 SVG 为独立组件，支持 `size` / `className` props。

### 阶段 4：路由配置与最小可运行页面

#### 4.1 `src/routes/index.tsx`

```tsx
import { createHashRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CreatePage } from "@/pages/CreatePage";
// ... 其它页面

export const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/create" replace /> },
      { path: "create",         element: <CreatePage /> },
      { path: "chat",           element: <ChatPage /> },
      { path: "workshop",       element: <WorkshopPage /> },
      { path: "image-studio",   element: <ImageStudioPage /> },
      { path: "agents",         element: <AgentsPage /> },
      { path: "plan",           element: <PlanPage /> },
      { path: "*",              element: <Navigate to="/create" replace /> },
    ],
  },
]);
```

#### 4.2 最小占位页面

阶段 3 完成后，每个 Page 先渲染一个简单的 `<section className="page-section">` + 标题，确保 `npm run dev` 可启动、路由可切换、Sidebar 可折叠。各页面完整业务逻辑（CreatePage 的 Hero+表单、ChatPage 的对话、WorkshopPage 的 6 步工坊等）作为后续迭代任务，不在本次重构范围内一次性写完。

> 用户原话："**先梳理项目的文件目录结构，然后开始编写核心布局 (Layout) 和第一个关键组件的代码**"。本次交付边界到此结束；其它页面留待下一轮迭代。

### 阶段 5：验证

#### 5.1 安装依赖
```bash
cd qinghe-video/frontend
npm install
```

#### 5.2 启动开发服务器
```bash
# 终端 1：后端
cd qinghe-video && uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload

# 终端 2：前端
cd qinghe-video/frontend && npm run dev
```

#### 5.3 验收清单
- [ ] `http://localhost:5173/` 加载，自动跳到 `/#/create`
- [ ] 未登录时 `<AuthOverlay />` 显示，登录后消失
- [ ] Sidebar 默认折叠（64px），点击 toggle 按钮或品牌 mark 平滑展开到 280px
- [ ] 折叠状态在刷新后保持
- [ ] 展开时点击页面空白处自动折叠
- [ ] 展开时按 Esc 自动折叠
- [ ] Header 中 5 个导航链接可切换路由，当前项高亮
- [ ] `<HealthPill />` 显示后端状态（绿/红/灰），30s 轮询
- [ ] Footer 显示品牌 + 链接列
- [ ] Tab 键可顺序聚焦所有交互元素；屏幕阅读器朗读 `aria-label`
- [ ] 按钮悬停有缩放微交互（`hover:scale-105 active:scale-95`）
- [ ] 列表项进入有淡入升起动画

#### 5.4 生产构建
```bash
cd qinghe-video/frontend && npm run build
# 产物在 frontend/dist/，FastAPI 自动 serve
```

---

## 不在本次范围内 (Out of Scope)

以下作为后续迭代任务，本次不实现：

1. `CreatePage` 完整 Hero 区 + 作品展示卡片 + 录入表单（React Hook Form + Zod）
2. `ChatPage` 对话创作 UI（消息列表、输入框、SSE 接入）
3. `WorkshopPage` 6 步 Agent 工坊（左侧 step rail + 右侧 stage）
4. `ImageStudioPage` 九宫格导演板（图片上传 + 9 宫格展示）
5. `AgentsPage` Agent 管理调试面板
6. `PlanPage` 方案列表管理
7. `useGenerateStream` hook + `pipeline-store` 完整 SSE 事件处理
8. 修复 AGENTS.md 中描述的"pipeline 状态丢失"bug（在 React 版本中通过 `pipeline-store` + `sessionStorage` 自然解决）

这些将基于本次建立的 Layout、stores、hooks、ui/ 原子组件继续构建。

---

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| 旧前端被覆盖导致无法回退 | 阶段 0 备份到 `_legacy-html/`，验证通过前不删除 |
| 后端 main.py 改动影响生产 | 仅扩展 SPA 路由 + 调整 dist 路径；开发模式不依赖此改动 |
| shadcn/ui 默认样式与暖色主题冲突 | `components.json` 选 `baseColor: "stone"` + 手动覆盖 CSS 变量为 `#f5f1e8` 系 |
| Tailwind v4 已发布但生态未稳 | 锁定 v3.4.17，等 shadcn/ui 官方迁移后再升 |
