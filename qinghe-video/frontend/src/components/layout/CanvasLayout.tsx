import { Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { AuthOverlay } from "@/components/auth/AuthOverlay";

/**
 * 无限画布全屏布局。
 *
 * 与 AppLayout 不同，此布局隐藏 Sidebar / Header / Footer，让 CanvasPage
 * 独占整个视口。未登录时仍叠加 AuthOverlay。
 */
export function CanvasLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <>
      <AnimatePresence>
        {!isAuthenticated && <AuthOverlay />}
      </AnimatePresence>
      <div className="h-screen w-screen overflow-hidden bg-background">
        <Outlet />
      </div>
    </>
  );
}
