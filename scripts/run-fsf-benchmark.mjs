import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { resolve } from "node:path";

import { createServer } from "vite";

const PORT = 4174;
const HOST = "127.0.0.1";
const RESULT_ROUTE = "/__fsf-benchmark-result";
const noOpen = process.argv.includes("--no-open");
const engine =
  process.argv.find((arg) => arg.startsWith("--engine="))?.slice("--engine=".length) ??
  "fairy-stockfish-14";
if (engine !== "fairy-stockfish-14" && engine !== "atomic-stockfish") {
  throw new Error("Use --engine=fairy-stockfish-14 or --engine=atomic-stockfish");
}

let finish;
const received = new Promise((resolveResult) => {
  finish = resolveResult;
});

const collectorPlugin = {
  name: "fsf-benchmark-collector",
  configureServer(server) {
    server.middlewares.use(RESULT_ROUTE, (request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (result.benchmark !== `${engine}-analysis`) {
            throw new Error("Result came from a different engine");
          }
          response.statusCode = 204;
          response.end();
          finish(result);
        } catch (error) {
          response.statusCode = 400;
          response.end(error instanceof Error ? error.message : "Invalid result");
        }
      });
    });
  },
};

const firefoxBinary = () => {
  if (process.env.FIREFOX_BIN) return process.env.FIREFOX_BIN;
  if (platform() === "darwin") return "/Applications/Firefox.app/Contents/MacOS/firefox";
  if (platform() === "win32") return "C:\\Program Files\\Mozilla Firefox\\firefox.exe";
  return "firefox";
};

const server = await createServer({
  server: { host: HOST, port: PORT, strictPort: true },
  plugins: [collectorPlugin],
});

await server.listen();
const runId = Date.now();
const url = `http://${HOST}:${PORT}/benchmarks/fairy-stockfish/?autorun=1&engine=${engine}&run=${runId}`;
console.log(`${engine} benchmark ready:\n${url}`);

if (!noOpen) {
  const browser = spawn(firefoxBinary(), ["--new-window", url], {
    detached: true,
    stdio: "ignore",
  });
  browser.on("error", (error) => {
    console.error(`Could not open Firefox: ${error.message}`);
    console.error("Open the URL above manually, or rerun with FIREFOX_BIN set.");
  });
  browser.unref();
}

try {
  const result = await received;
  const resultsDir = resolve("benchmarks/fairy-stockfish/results");
  await mkdir(resultsDir, { recursive: true });
  const safeTimestamp = result.createdAt.replaceAll(":", "-");
  const outputPath = resolve(resultsDir, `${safeTimestamp}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log("\nBenchmark complete");
  console.log(`  Cold first result: ${Math.round(result.summary.coldFirstResultMs)} ms`);
  console.log(
    `  Warm median first result: ${Math.round(result.summary.warmMedianFirstResultMs)} ms`,
  );
  console.log(`  Warm median NPS: ${Math.round(result.summary.warmMedianNps).toLocaleString()}`);
  console.log(`  Saved: ${outputPath}`);
} finally {
  await server.close();
}
