import { createServer, type RequestListener } from "node:http";
import { gzipSync } from "node:zlib";

import { expect, type Page, test } from "@playwright/test";

import { ATOMIC_STOCKFISH_WORKER_URL } from "../src/lib/practice/atomicStockfishAssets";

const serveNetwork = async (respond: RequestListener) => {
  const server = createServer(respond);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No network fixture port");
  return {
    url: `http://127.0.0.1:${address.port}/fixture.nnue`,
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
};

const initializeWorker = (
  page: Page,
  networkUrl: string,
  expectedBytes: number,
  disposeAfterProgress = false,
) =>
  page.evaluate(
    ({ workerUrl, networkUrl, expectedBytes, disposeAfterProgress }) =>
      new Promise<string>((resolve) => {
        const worker = new Worker(workerUrl, { type: "module" });
        const finish = (result: string) => {
          clearTimeout(deadline);
          worker.terminate();
          resolve(result);
        };
        const deadline = setTimeout(() => finish("timed out"), 5_000);
        worker.onerror = () => finish("worker error");
        worker.onmessage = ({ data }: MessageEvent<{ type: string; code?: string }>) => {
          if (disposeAfterProgress && data.type === "downloadProgress") {
            worker.postMessage({ type: "dispose" });
          }
          if (["disposed", "ready", "error"].includes(data.type)) finish(data.code ?? data.type);
        };
        worker.postMessage({
          type: "initialize",
          networkUrl,
          expectedBytes,
          expectedSha256: "0".repeat(64),
        });
      }),
    {
      workerUrl: ATOMIC_STOCKFISH_WORKER_URL,
      networkUrl,
      expectedBytes,
      disposeAfterProgress,
    },
  );

test.beforeEach(async ({ page }) => {
  await page.goto(ATOMIC_STOCKFISH_WORKER_URL.replace(/[^/]+$/, "manifest.json"));
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
});

test("disposal cancels a stalled NNUE download", async ({ page }) => {
  let clientDisconnected = false;
  const network = await serveNetwork((_request, response) => {
    response.on("close", () => {
      clientDisconnected = true;
    });
    response.writeHead(200, {
      "access-control-allow-origin": "*",
      "content-length": 4,
      "content-type": "application/octet-stream",
    });
    response.write(Buffer.from([1]));
    // Leave the body open so the worker must cancel a pending read.
  });

  try {
    const outcome = await initializeWorker(page, network.url, 4, true);
    expect(outcome).toBe("disposed");
    await expect.poll(() => clientDisconnected).toBe(true);
  } finally {
    network.close();
  }
});

test("the expected NNUE size is checked after HTTP decompression", async ({ page }) => {
  const gzip = gzipSync(Buffer.from([1, 2, 3, 4]));
  const network = await serveNetwork((_request, response) => {
    response.writeHead(200, {
      "access-control-allow-origin": "*",
      "content-encoding": "gzip",
      "content-length": gzip.length,
      "content-type": "application/octet-stream",
    });
    response.end(gzip);
  });

  try {
    const results = [];
    for (const bytes of [4, 3, 5]) results.push(await initializeWorker(page, network.url, bytes));

    // Exact size proceeds to integrity verification; either size mismatch fails first.
    expect(results).toEqual(["network-sha256", "network-invalid", "network-invalid"]);
  } finally {
    network.close();
  }
});
