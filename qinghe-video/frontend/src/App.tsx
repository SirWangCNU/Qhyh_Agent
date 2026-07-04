import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "@/routes";
import { queryClient } from "@/lib/queryClient";

export default function App() {
  // hydrate 已在 main.tsx 渲染前同步完成，此处无需重复
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
