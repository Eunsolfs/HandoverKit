import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const { SERVER_URL = "http://localhost:3000" } = loadEnv(
    mode,
    import.meta.dirname,
    ""
  );

  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react({ compiler: true }),
      tailwindcss(),
    ],
    server: {
      // Node 24 下 localhost 可能只解析到 ::1，显式绑定 IPv4 让 Playwright/curl 都能访问。
      host: "127.0.0.1",
      proxy: {
        "/api": SERVER_URL,
        "/rpc": SERVER_URL,
      },
    },
  };
});
