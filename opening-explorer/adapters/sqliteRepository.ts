import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { promisify } from "node:util";

import { createOpeningExplorerQueue } from "../../opening-explorer-request-queue.js";
import type { JsonRow, OpeningExplorerRepository, PriorityRef } from "../core/service.js";

const execFileAsync = promisify(execFile);

export const createSqliteRepository = (
  dbPath: string,
  execute: (sql: string) => Promise<JsonRow[]> = async (sql) => {
    const { stdout } = await execFileAsync("sqlite3", [
      "-json",
      "-cmd",
      ".timeout 10000",
      dbPath,
      sql,
    ]);
    return JSON.parse(stdout.trim() || "[]") as JsonRow[];
  },
): OpeningExplorerRepository => {
  const queue = createOpeningExplorerQueue({ maxConcurrent: 3, maxQueued: 36 });
  return {
    source: "sqlite",
    availability: () => ({
      available: existsSync(dbPath),
      message: "data/openings.sqlite was not found",
    }),
    signature: () => {
      try {
        const stats = statSync(dbPath);
        return `sqlite:${stats.mtimeMs}:${stats.size}`;
      } catch {
        return "sqlite:missing";
      }
    },
    query: (sql: string, priorityRef: PriorityRef) =>
      queue.enqueue(() => execute(sql), priorityRef),
  };
};
