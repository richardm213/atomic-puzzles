import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("uses the configured credential only for the fixed workflow and coalesces request bursts", async () => {
  vi.resetModules();
  vi.stubEnv("GAME_ANALYSIS_GITHUB_TOKEN", "");
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  const { dispatchGameAnalysisWorker } = await import("../features/gameAnalysis/dispatch");
  await dispatchGameAnalysisWorker();
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("GAME_ANALYSIS_GITHUB_TOKEN", "dispatch-token");
  await Promise.all([dispatchGameAnalysisWorker(), dispatchGameAnalysisWorker()]);
  await dispatchGameAnalysisWorker();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "https://api.github.com/repos/richardm213/atomic-puzzles/actions/workflows/game-analysis.yml/dispatches",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer dispatch-token" }),
      body: JSON.stringify({ ref: "main", inputs: { task: "workers" } }),
    }),
  );
});

it("leaves a purchased job queued on dispatch failure and allows the next request to retry", async () => {
  vi.resetModules();
  vi.stubEnv("GAME_ANALYSIS_GITHUB_TOKEN", "dispatch-token");
  const fetch = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { dispatchGameAnalysisWorker } = await import("../features/gameAnalysis/dispatch");
  await expect(dispatchGameAnalysisWorker()).resolves.toBeUndefined();
  await expect(dispatchGameAnalysisWorker()).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
});
