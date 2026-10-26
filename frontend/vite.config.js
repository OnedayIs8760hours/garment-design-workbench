import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      port: 1234,
      proxy: {
        "/api/agent": {
          target: env.VITE_AGENT_URL || "http://127.0.0.1:8958",
          changeOrigin: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
        "/api": {
          target: env.VITE_BACKEND_URL || "http://127.0.0.1:8957",
          changeOrigin: true,
        },
      },
    },
  };
});
