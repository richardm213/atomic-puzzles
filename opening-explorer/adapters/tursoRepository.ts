import { type Client,createClient } from "@libsql/client/web";

import { createOpeningExplorerQueue } from "../../opening-explorer-request-queue.js";
import type { JsonRow, OpeningExplorerRepository, PriorityRef } from "../core/service.js";

const normalizeValue = (value: unknown): unknown =>
  typeof value === "bigint" ? Number(value) : value;
const normalizeRows = (rows: Iterable<Record<string, unknown>>): JsonRow[] =>
  Array.from(rows, (row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)])),
  );

export const createTursoRepository = (
  options: { url?: string; authToken?: string; client?: Client } = {},
): OpeningExplorerRepository => {
  const url = options.url?.trim() ?? process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const authToken = options.authToken?.trim() ?? process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  const client = options.client ?? (url && authToken ? createClient({ url, authToken }) : null);
  const queue = createOpeningExplorerQueue({ maxConcurrent: 3, maxQueued: 36 });

  return {
    source: "turso",
    availability: () => ({
      available: Boolean(client),
      message: "Opening explorer Turso credentials are not configured",
    }),
    signature: () => `turso:${url}`,
    query: (sql: string, priorityRef: PriorityRef) =>
      queue.enqueue(async () => {
        if (!client) throw new Error("Opening explorer Turso credentials are not configured");
        return normalizeRows((await client.execute(sql)).rows);
      }, priorityRef),
  };
};
