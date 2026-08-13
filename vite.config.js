import { Buffer } from "node:buffer";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import { createOpeningExplorerVitePlugin } from "./opening-explorer/adapters/viteHandler.ts";

const MAX_LOCAL_FUNCTION_BODY_BYTES = 1_000_000;

const readRequestBody = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_LOCAL_FUNCTION_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const requestHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(", ") : value,
    ]),
  );

const localPuzzleFunctionsPlugin = () => {
  const functions = new Map([
    ["/api/auth/session", "/netlify/functions/auth-session.ts"],
    ["/api/puzzles/submit", "/netlify/functions/puzzle-submit.ts"],
    ["/api/puzzles/review", "/netlify/functions/puzzle-review.ts"],
    ["/api/puzzles/tags", "/netlify/functions/puzzle-tags.ts"],
    ["/api/puzzles/community", "/netlify/functions/puzzle-community.ts"],
    ["/api/puzzles/progress", "/netlify/functions/puzzle-progress.ts"],
    ["/api/notifications", "/netlify/functions/notifications.ts"],
  ]);

  return {
    name: "atomic-local-puzzle-functions",
    enforce: "pre",
    configureServer(server) {
      for (const [route, modulePath] of functions) {
        server.middlewares.use(route, async (req, res) => {
          try {
            const module = await server.ssrLoadModule(modulePath);
            const response = await module.handler({
              httpMethod: req.method,
              headers: requestHeaders(req.headers),
              body: await readRequestBody(req),
            });
            res.statusCode = response.statusCode;
            for (const [name, value] of Object.entries(response.headers ?? {})) {
              res.setHeader(name, value);
            }
            res.end(response.body ?? "");
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Local puzzle function failed.",
              }),
            );
          }
        });
      }
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.SUPABASE_URL ||= env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
      },
    },
    base: "/",
    css: { preprocessorOptions: { scss: { api: "modern-compiler" } } },
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("react")) return "vendor-react";
            if (id.includes("@tanstack")) return "vendor-router";
            if (id.includes("chessops") || id.includes("chessground")) return "vendor-chess";
            if (id.includes("fortawesome")) return "vendor-icons";
            if (id.includes("supabase") || id.includes("libsql")) return "vendor-data";
            return undefined;
          },
        },
      },
    },
    plugins: [react(), localPuzzleFunctionsPlugin(), createOpeningExplorerVitePlugin()],
  };
});
