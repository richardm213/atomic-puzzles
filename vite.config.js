import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoName = "atomic-puzzles";
const productionBase = `/${repoName}/`;

export default defineConfig(({ command }) => ({
  base: command === "build" ? productionBase : "/",
  plugins: [react()],
}));
