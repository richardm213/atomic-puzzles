import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";

import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";

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
      void (async () => {
        const servicePath =
          path === "/api/opening-explorer" && url.pathname !== "/"
            ? `${path}${url.pathname}`
            : path;
        const intentHeader = req.headers["x-explorer-intent"];
        const intent = Array.isArray(intentHeader) ? intentHeader[0] : intentHeader;
        const response = await service.handle({
          path: servicePath,
          params: url.searchParams,
          ...(req.method ? { method: req.method } : {}),
          ...(intent ? { intent } : {}),
        });
        applyResponse(response, res);
      })().catch((error: unknown) => {
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
      });
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
