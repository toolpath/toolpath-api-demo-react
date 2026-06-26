import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    exclude: ["dist/**", "node_modules/**"],
    restoreMocks: true,
    clearMocks: true
  }
});
