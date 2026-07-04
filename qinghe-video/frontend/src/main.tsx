import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// 加载本地字体（登录页与品牌展示页使用）
import "@fontsource/instrument-serif/400.css";
import "@fontsource/geist/100.css";
import "@fontsource/geist/200.css";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist/800.css";
import "@fontsource/geist/900.css";

// 在 React 渲染前同步恢复鉴权/UI 状态，避免子组件首次查询早于 hydrate 触发 401
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { usePipelineStore } from "@/stores/pipeline-store";
import { useWorkshopStore } from "@/stores/workshop-store";
useAuthStore.getState().hydrate();
useUIStore.getState().hydrate();
usePipelineStore.getState().hydrate();
useWorkshopStore.getState().hydrate();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
