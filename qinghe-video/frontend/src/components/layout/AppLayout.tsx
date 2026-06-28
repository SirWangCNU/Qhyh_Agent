import { Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { AuthOverlay } from "@/components/auth/AuthOverlay";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Footer } from "./Footer";

/**
 * 根布局：左侧 Sidebar + 右侧 site-body（Header + main + Footer）。
 * 未登录时叠加 AuthOverlay。
 */
export function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <>
      <AnimatePresence>
        {!isAuthenticated && <AuthOverlay />}
      </AnimatePresence>

      <div className="site-wrapper flex min-h-screen bg-background">
        <Sidebar />
        <div className="site-body relative z-[2] flex min-w-0 flex-1 flex-col">
          <Header />
          <main
            id="main-content"
            className="flex-1 outline-none"
            tabIndex={-1}
            aria-label="主要内容"
          >
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
}
