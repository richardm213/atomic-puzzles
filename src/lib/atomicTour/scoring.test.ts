import { describe, expect, it } from "vitest";

import {
  atomicChessLeagueTourPoints,
  atomicTourLosersBracketRoundCountForStart,
  atomicTourLosersBracketWinPoints,
  atomicTourMainStageForResults,
  atomicTourPlacementAfterChampionship,
  atomicTourStageForFinalRank,
  atomicTourStageForRound,
  calculateKnockoutTourPoints,
} from "./scoring";

describe("Atomic Tour scoring", () => {
  it("uses ATP-style placement percentages", () => {
    expect(calculateKnockoutTourPoints({ tier: 2000, mainStage: "champion" }).totalPoints).toBe(
      2000,
    );
    expect(calculateKnockoutTourPoints({ tier: 2000, mainStage: "final" }).totalPoints).toBe(1200);
    expect(calculateKnockoutTourPoints({ tier: 1000, mainStage: "quarterfinal" }).totalPoints).toBe(
      180,
    );
  });

  it("maps final standings to bracket-equivalent placement tiers", () => {
    expect(atomicTourStageForFinalRank(1)).toBe("champion");
    expect(atomicTourStageForFinalRank(2)).toBe("final");
    expect(atomicTourStageForFinalRank(4)).toBe("semifinal");
    expect(atomicTourStageForFinalRank(8)).toBe("quarterfinal");
    expect(atomicTourStageForFinalRank(16)).toBe("round-of-16");
    expect(atomicTourStageForFinalRank(32)).toBe("round-of-32");
    expect(atomicTourStageForFinalRank(33)).toBe("round-of-64");
    expect(atomicTourStageForFinalRank(0)).toBeNull();
  });

  it("caps losers-bracket bonuses below the next main-bracket tier", () => {
    const roundOf16 = calculateKnockoutTourPoints({
      tier: 2000,
      mainStage: "round-of-16",
      losersBracketWinRounds: [0, 1, 2, 3, 4, 5, 6, 7],
    });
    const quarterfinal = calculateKnockoutTourPoints({
      tier: 2000,
      mainStage: "quarterfinal",
    });

    expect(roundOf16.totalPoints).toBeLessThan(quarterfinal.totalPoints);
  });

  it("awards half points for ACL draws", () => {
    expect(atomicChessLeagueTourPoints("elite", "win")).toBe(100);
    expect(atomicChessLeagueTourPoints("elite", "draw")).toBe(50);
    expect(atomicChessLeagueTourPoints("challenger", "win")).toBe(50);
    expect(atomicChessLeagueTourPoints("challenger", "draw")).toBe(25);
    expect(atomicChessLeagueTourPoints("challenger", "loss")).toBe(0);
  });

  it("does not award advanced-round points for a bye followed by a loss", () => {
    expect(
      atomicTourMainStageForResults("entered", [
        { stage: "entered", outcome: "bye" },
        { stage: "round-of-64", outcome: "bye" },
        { stage: "round-of-32", outcome: "bye" },
        { stage: "round-of-16", outcome: "loss" },
      ]),
    ).toBe("entered");
  });

  it("advances the earned stage only after a played win", () => {
    expect(
      atomicTourMainStageForResults("entered", [
        { stage: "entered", outcome: "bye" },
        { stage: "round-of-64", outcome: "win" },
        { stage: "round-of-32", outcome: "loss" },
      ]),
    ).toBe("round-of-32");
  });

  it("treats a winners-bracket final as qualification when a grand final follows", () => {
    expect(atomicTourStageForRound("Finals", false)).toBe("final");
    expect(atomicTourStageForRound("Finals", true)).toBe("winners-final");
    expect(atomicTourStageForRound("Grand Final", true)).toBe("final");
  });

  it("values later losers-bracket wins more than early-round wins", () => {
    const early = calculateKnockoutTourPoints({
      tier: 2000,
      mainStage: "round-of-16",
      losersBracketWinRounds: [0],
    });
    const late = calculateKnockoutTourPoints({
      tier: 2000,
      mainStage: "round-of-16",
      losersBracketWinRounds: [5],
    });

    expect(late.bonusPoints).toBeGreaterThan(early.bonusPoints);
  });

  it("exposes the losers-bracket points awarded for each round", () => {
    expect(atomicTourLosersBracketWinPoints(2000, 0)).toBe(40);
    expect(atomicTourLosersBracketWinPoints(1000, 5)).toBe(80);
    expect(atomicTourLosersBracketWinPoints(2000, 9)).toBe(320);
  });

  it("anchors losers-bracket points to the main round that feeds the bracket", () => {
    expect(atomicTourLosersBracketWinPoints(2000, 0, "round-of-32")).toBe(80);
    expect(atomicTourLosersBracketWinPoints(2000, 0, "quarterfinal")).toBe(200);
    expect(atomicTourLosersBracketRoundCountForStart("round-of-32")).toBe(8);
    expect(atomicTourLosersBracketRoundCountForStart("quarterfinal")).toBe(4);
  });

  it("keeps a losers-bracket finalist meaningfully below the champion", () => {
    const runnerUp = calculateKnockoutTourPoints({
      tier: 2000,
      mainStage: "final",
      losersBracketWinRounds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    });

    expect(runnerUp.totalPoints).toBe(1600);
    expect(runnerUp.totalPoints).toBeLessThan(2000);
  });

  it("allows a champion who returned through the losers bracket to exceed the title base", () => {
    const champion = calculateKnockoutTourPoints({
      tier: 2000,
      mainStage: "champion",
      losersBracketWinRounds: [5, 6, 7, 8, 9],
    });

    expect(champion.basePoints).toBe(2000);
    expect(champion.bonusPoints).toBe(200);
    expect(champion.totalPoints).toBe(2200);
  });

  it("uses the deciding grand-final result for champion and runner-up placement", () => {
    expect(atomicTourPlacementAfterChampionship("final", "win")).toBe("champion");
    expect(atomicTourPlacementAfterChampionship("champion", "loss")).toBe("final");
  });
});
