import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";

import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";

import { parseExplorerNavigation } from "../core/requestLifecycle.js";
import { createOpeningExplorerService } from "../core/service.js";
import { createSqliteRepository } from "./sqliteRepository.js";

const applyResponse = (
  response: { statusCode: number; headers: Record<string, string>; body: string },
  res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  },
) => {
  res.statusCode = response.statusCode;
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  res.end(response.body);
};

export const createOpeningExplorerVitePlugin = (): Plugin => {
  const dbPath = resolve(process.cwd(), "data/openings.sqlite");
  const service = createOpeningExplorerService(createSqliteRepository(dbPath));

  const middleware =
    (path: string) => (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (path === "/api/opening-explorer" && url.pathname !== "/" && url.pathname !== "/health") {
        next();
        return;
      }
      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) controller.abort();
      };
      res.once("close", onClose);
      void (async () => {
        const servicePath =
          path === "/api/opening-explorer" && url.pathname !== "/"
            ? `${path}${url.pathname}`
            : path;
        const intentHeader = req.headers["x-explorer-intent"];
        const intent = Array.isArray(intentHeader) ? intentHeader[0] : intentHeader;
        const header = (name: string) => {
          const value = req.headers[name];
          return Array.isArray(value) ? value[0] : value;
        };
        const navigation = parseExplorerNavigation(
          header("x-explorer-session"),
          header("x-explorer-sequence"),
        );
        const response = await service.handle({
          path: servicePath,
          params: url.searchParams,
          signal: controller.signal,
          ...(navigation
            ? {
                navigation: {
                  ...navigation,
                  session: `${req.socket.remoteAddress}:${navigation.session}`,
                },
              }
            : {}),
          ...(req.method ? { method: req.method } : {}),
          ...(intent ? { intent } : {}),
        });
        if (!res.destroyed) applyResponse(response, res);
      })()
        .catch((error: unknown) => {
          if (res.destroyed) return;
          applyResponse(
            {
              statusCode: 500,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
              body: JSON.stringify({
                error: error instanceof Error ? error.message : "Opening explorer request failed",
              }),
            },
            res,
          );
        })
        .finally(() => res.removeListener("close", onClose));
    };

  const configure = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use("/api/opening-players", middleware("/api/opening-players"));
    server.middlewares.use("/api/opening-explorer", middleware("/api/opening-explorer"));
  };

  return {
    name: "atomic-opening-explorer-api",
    enforce: "pre",
    configureServer(server) {
      console.log(
        `[opening-explorer] SQLite middleware mounted at /api/opening-explorer (${dbPath})`,
      );
      configure(server);
    },
    configurePreviewServer: configure,
  };
};
