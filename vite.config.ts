import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.PORT ?? "3002";

  return {
    plugins: [react()],
    root: ".",
    build: {
      outDir: "dist/client",
      emptyOutDir: false
    },
    server: {
      port: 5173,
      proxy: {
        "/api": `http://localhost:${apiPort}`
      }
    }
  };
});
