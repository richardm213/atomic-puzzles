import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "netlify/tests/*.{test,spec}.ts",
      "opening-explorer/tests/*.{test,spec}.ts",
    ],
    exclude: ["node_modules", "dist", ".claude"],
  },
});
