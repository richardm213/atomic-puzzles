import { describe, expect, it } from "vitest";

import {
  createInitialPuzzleSession,
  getPuzzleSessionAccess,
  puzzleSessionReducer,
} from "./puzzleSession";

describe("puzzle session", () => {
  it("requires a current or resumed submission before resignation", () => {
    const session = createInitialPuzzleSession();
    expect(getPuzzleSessionAccess(session, 0, false)).toEqual({
      analysis: false,
      hasAttempted: false,
      canGiveUp: false,
    });
    expect(getPuzzleSessionAccess(session, 0, false, true)).toMatchObject({
      canGiveUp: true,
      hasAttempted: false,
    });
    expect(getPuzzleSessionAccess(session, 1, false)).toEqual({
      analysis: false,
      hasAttempted: true,
      canGiveUp: true,
    });
  });

  it("lets a first wrong attempt continue in solve mode and a later correct attempt enter analysis", () => {
    const wrong = puzzleSessionReducer(createInitialPuzzleSession(), {
      type: "attempt-resolved",
      correct: false,
    });
    expect(getPuzzleSessionAccess(wrong, 0, false)).toMatchObject({
      analysis: false,
      canGiveUp: true,
    });
    expect(getPuzzleSessionAccess(wrong, 0, true, true)).toMatchObject({
      analysis: false,
      canGiveUp: false,
    });

    const correct = puzzleSessionReducer(wrong, {
      type: "attempt-resolved",
      correct: true,
    });
    expect(getPuzzleSessionAccess(correct, 1, false)).toMatchObject({
      analysis: true,
      canGiveUp: false,
    });
  });

  it("keeps a returning player in solve mode after a miss and locks a new visit", () => {
    const attempted = puzzleSessionReducer(createInitialPuzzleSession(), {
      type: "attempt-resolved",
      correct: false,
    });
    const withFeedback = puzzleSessionReducer(attempted, {
      type: "board-feedback",
      feedback: { type: "wrong", title: "Incorrect", icon: "×" },
    });
    expect(withFeedback.attempt).toBe("wrong");
    expect(getPuzzleSessionAccess(withFeedback, 0, false).analysis).toBe(false);
    expect(
      puzzleSessionReducer(withFeedback, {
        type: "attempt-resolved",
        correct: true,
      }),
    ).toMatchObject({ attempt: "solved" });

    const nextVisit = puzzleSessionReducer(withFeedback, { type: "reset" });
    expect(getPuzzleSessionAccess(nextVisit, 0, false)).toMatchObject({
      analysis: false,
      canGiveUp: false,
    });
  });
});
