import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// 开发时把 /api /outputs 请求代理到 FastAPI :18739，避免跨域
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
