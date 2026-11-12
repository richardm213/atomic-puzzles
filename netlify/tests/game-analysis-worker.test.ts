import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pending: vi.fn(),
  poll: vi.fn(),
  submit: vi.fn(),
  openings: vi.fn(),
  database: {},
}));
vi.mock("../features/gameAnalysis/service", () => ({
  hasPendingGameAnalyses: mocks.pending,
  processPendingGameAnalyses: mocks.poll,
  submitPendingGameAnalysisPositions: mocks.submit,
}));
vi.mock("../features/gameAnalysis/openings", () => ({
  refreshGameAnalysisOpenings: mocks.openings,
}));
vi.mock("../platform/environment", () => ({ createServerSupabase: () => mocks.database }));

import { runGameAnalysisWorker } from "../features/gameAnalysis/worker";

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("exits immediately when the queue is empty", async () => {
  mocks.pending.mockResolvedValue(false);
  await runGameAnalysisWorker("poll");
  expect(mocks.poll).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it.each(["poll", "submit"] as const)(
  "repeats the %s pump only while work remains and within its time budget",
  async (task) => {
    vi.useFakeTimers();
    mocks.pending.mockResolvedValue(true);
    const running = runGameAnalysisWorker(task, { durationMs: 70_000 });
    await vi.advanceTimersByTimeAsync(70_000);
    await running;
    expect(task === "poll" ? mocks.poll : mocks.submit).toHaveBeenCalledTimes(2);
    expect(task === "poll" ? mocks.submit : mocks.poll).not.toHaveBeenCalled();
  },
);

it("runs opening refresh once even when the game queue is empty", async () => {
  mocks.openings.mockResolvedValue({ refreshed: 1, failed: 0 });
  await runGameAnalysisWorker("openings");
  expect(mocks.openings).toHaveBeenCalledExactlyOnceWith(mocks.database);
  expect(mocks.pending).not.toHaveBeenCalled();
});

it("surfaces a failed pass so GitHub reports failure and a later run can retry", async () => {
  mocks.pending.mockResolvedValue(true);
  mocks.poll.mockRejectedValue(new Error("Database unavailable"));
  await expect(runGameAnalysisWorker("poll")).rejects.toThrow("Database unavailable");
});
