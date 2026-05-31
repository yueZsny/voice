import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      // WebSocket 代理：开发环境前端 ws://localhost:5173/ws → 后端 ws://localhost:3001
      "/ws": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
