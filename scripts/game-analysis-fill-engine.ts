import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import type {
  SearchSupplementalEngine,
  SupplementalEngineLine,
} from "../shared/domain/gameAnalysisVariations";

export const createGameAnalysisFillEngine = (binary: string, network: string, workers = 4) => {
  const engines = Array.from({ length: workers }, () => {
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = createInterface({ input: child.stdout });
    let lastError = "";
    let error: Error | undefined;
    let listener: ((line: string) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;
    child.stderr.on("data", (chunk: Buffer) => {
      lastError = chunk.toString().trim();
    });
    child.on("error", (reason) => {
      error = reason;
      fail?.(reason);
    });
    child.stdin.on("error", (reason) => {
      error = reason;
      fail?.(reason);
    });
    child.on("exit", (code) => {
      error = new Error(`Atomic-Stockfish exited (${code}): ${lastError}`);
      fail?.(error);
    });
    stdout.on("line", (line) => listener?.(line));

    const command = (lines: string[], until: string, onLine?: (line: string) => void) =>
      new Promise<void>((resolve, reject) => {
        if (error) {
          reject(error);
          return;
        }
        const cleanup = () => {
          clearTimeout(timer);
          listener = undefined;
          fail = undefined;
        };
        const timer = setTimeout(() => {
          cleanup();
          child.kill();
          reject(new Error(`Atomic-Stockfish did not send ${until}.`));
        }, 15_000);
        fail = (reason) => {
          cleanup();
          reject(reason);
        };
        listener = (line) => {
          onLine?.(line);
          if (line === until || line.startsWith(until + " ")) {
            cleanup();
            resolve();
          }
        };
        child.stdin.write(lines.join("\n") + "\n");
      });

    let queue: Promise<unknown> = command(["uci"], "uciok").then(() =>
      command(
        [
          `setoption name EvalFile value ${network}`,
          "setoption name Hash value 16",
          "setoption name UCI_Chess960 value true",
          "isready",
        ],
        "readyok",
      ),
    );
    // The caller will receive initialization errors on its first search.
    void queue.catch(() => undefined);
    const search: SearchSupplementalEngine = (fen, count, roots) => {
      const next = queue.then(async () => {
        const latest = new Map<number, SupplementalEngineLine>();
        await command(
          [
            `setoption name MultiPV value ${count}`,
            `position fen ${fen}`,
            `go nodes ${20_000 * count}${roots?.length ? ` searchmoves ${roots.join(" ")}` : ""}`,
          ],
          "bestmove",
          (line) => {
            const match =
              /^info depth (\d+).*?multipv (\d+) score (cp|mate) (-?\d+)(?:\s+\w+)*?\s+pv\s+(.+)$/.exec(
                line,
              );
            if (!match) return;
            const [, depth, index, type, score, pv] = match;
            latest.set(Number(index), {
              pv: pv!.trim().split(/\s+/),
              cp: type === "cp" ? Number(score) : null,
              mate: type === "mate" ? Number(score) : null,
              depth: Number(depth),
            });
          },
        );
        return [...latest.entries()].sort(([a], [b]) => a - b).map(([, result]) => result);
      });
      queue = next;
      return next;
    };
    return { search, stop: () => child.kill() };
  });
  let next = 0;
  const search: SearchSupplementalEngine = (...args) =>
    engines[next++ % engines.length]!.search(...args);
  return { search, stop: () => engines.forEach(({ stop }) => stop()) };
};
