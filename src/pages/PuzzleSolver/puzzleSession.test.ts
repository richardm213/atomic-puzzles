import { describe, expect, it } from "vitest";

import {
  createInitialPuzzleSession,
  getPuzzleEntry,
  getPuzzleSessionAccess,
  puzzleSessionReducer,
} from "./puzzleSession";

describe("puzzle session", () => {
  it("classifies history without marking the new visit as attempted", () => {
    const session = createInitialPuzzleSession();
    const fresh = getPuzzleEntry({
      previouslySolved: false,
      hasRatedAttempt: false,
      requiresFreshAttempt: false,
    });
    const retry = getPuzzleEntry({
      previouslySolved: false,
      hasRatedAttempt: true,
      requiresFreshAttempt: false,
    });
    const replay = getPuzzleEntry({
      previouslySolved: true,
      hasRatedAttempt: true,
      requiresFreshAttempt: true,
    });

    expect(getPuzzleSessionAccess(session, fresh, false)).toEqual({
      analysis: false,
      hasAttempted: false,
      canGiveUp: false,
      canViewSolution: false,
    });
    expect(getPuzzleSessionAccess(session, retry, false)).toEqual({
      analysis: false,
      hasAttempted: true,
      canGiveUp: true,
      canViewSolution: true,
    });
    expect(getPuzzleSessionAccess(session, replay, false)).toEqual({
      analysis: false,
      hasAttempted: false,
      canGiveUp: true,
      canViewSolution: false,
    });
    expect(
      getPuzzleEntry({
        previouslySolved: false,
        hasRatedAttempt: true,
        requiresFreshAttempt: true,
      }),
    ).toBe(fresh);
    expect(session.attempt).toBe("unresolved");
  });

  it("lets a first wrong attempt continue in solve mode and a later correct attempt enter analysis", () => {
    const wrong = puzzleSessionReducer(createInitialPuzzleSession(), {
      type: "attempt-resolved",
      correct: false,
      entry: "fresh",
    });
    expect(getPuzzleSessionAccess(wrong, "fresh", false)).toMatchObject({
      analysis: false,
      canGiveUp: true,
    });
    expect(getPuzzleSessionAccess(wrong, "fresh", true)).toMatchObject({
      analysis: false,
      canGiveUp: false,
      canViewSolution: false,
    });

    const correct = puzzleSessionReducer(wrong, {
      type: "attempt-resolved",
      correct: true,
      entry: "retry",
    });
    expect(getPuzzleSessionAccess(correct, "retry", false)).toMatchObject({
      analysis: true,
      canGiveUp: false,
      canViewSolution: true,
    });
    expect(correct.solutionRevealed).toBe(true);
  });

  it("keeps a replay revealed through board feedback, but hides it on the next visit", () => {
    const attempted = puzzleSessionReducer(createInitialPuzzleSession(), {
      type: "attempt-resolved",
      correct: false,
      entry: "replay",
    });
    const withFeedback = puzzleSessionReducer(attempted, {
      type: "board-feedback",
      feedback: { type: "wrong", title: "Incorrect", icon: "×" },
    });
    expect(withFeedback).toMatchObject({ attempt: "wrong", solutionRevealed: true });
    expect(getPuzzleSessionAccess(withFeedback, "replay", false).analysis).toBe(true);
    expect(
      puzzleSessionReducer(withFeedback, {
        type: "attempt-resolved",
        correct: true,
        entry: "replay",
      }),
    ).toBe(withFeedback);

    const nextVisit = puzzleSessionReducer(withFeedback, { type: "reset" });
    expect(getPuzzleSessionAccess(nextVisit, "replay", false)).toMatchObject({
      analysis: false,
      canGiveUp: true,
      canViewSolution: false,
    });
  });
});
