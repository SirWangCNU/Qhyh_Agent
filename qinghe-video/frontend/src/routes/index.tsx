import { Navigate, createHashRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CanvasLayout } from "@/components/layout/CanvasLayout";
import { CreatePage } from "@/pages/CreatePage";
import { ChatPage } from "@/pages/ChatPage";
import { WorkshopPage } from "@/pages/WorkshopPage";
import { CanvasPage } from "@/pages/CanvasPage";
import { PlanPage } from "@/pages/PlanPage";
import { AssetsPage } from "@/pages/AssetsPage";

/**
 * 哈希路由表。
 * 使用 createHashRouter 保持与旧 HTML 版本 (#/create 等) 的 URL 兼容。
 *
 * /canvas 使用独立的 CanvasLayout，隐藏顶部 Header、左侧 Sidebar 和底部 Footer，
 * 让无限画布独占整个视口。
 */
export const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/create" replace /> },
      { path: "create", element: <CreatePage /> },
      { path: "chat", element: <ChatPage /> },
      { path: "workshop", element: <WorkshopPage /> },
      { path: "plan", element: <PlanPage /> },
      { path: "assets", element: <AssetsPage /> },
      { path: "*", element: <Navigate to="/create" replace /> },
    ],
  },
  {
    path: "/canvas",
    element: <CanvasLayout />,
    children: [{ index: true, element: <CanvasPage /> }],
  },
]);
