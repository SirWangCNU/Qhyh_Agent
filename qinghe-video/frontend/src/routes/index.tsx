import { Navigate, createHashRouter } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { CreatePage } from "@/pages/CreatePage";
import { ChatPage } from "@/pages/ChatPage";
import { WorkshopPage } from "@/pages/WorkshopPage";
import { ImageStudioPage } from "@/pages/ImageStudioPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { PlanPage } from "@/pages/PlanPage";
import { AssetsPage } from "@/pages/AssetsPage";

/**
 * 哈希路由表。
 * 使用 createHashRouter 保持与旧 HTML 版本 (#/create 等) 的 URL 兼容。
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
      { path: "image-studio", element: <ImageStudioPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "plan", element: <PlanPage /> },
      { path: "assets", element: <AssetsPage /> },
      { path: "*", element: <Navigate to="/create" replace /> },
    ],
  },
]);
