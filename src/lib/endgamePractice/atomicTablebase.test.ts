import { describe, expect, it } from "vitest";

import {
  type AtomicTablebaseResponse,
  connectionAwareTablebaseDefenseUcis,
  longestTablebaseDefenseUcis,
  tablebasePositionIsDrawn,
  tablebaseSideIsLosing,
  tablebaseSideIsWinning,
  tablebaseStartIsLongerThanMateInFour,
} from "./atomicTablebase";

const response = {
  category: "loss",
  dtz: -8,
  checkmate: false,
  stalemate: false,
  variant_win: false,
  variant_loss: false,
  moves: [
    {
      uci: "d6c5",
      category: "win",
      dtz: 7,
      checkmate: false,
      stalemate: false,
      variant_win: false,
      variant_loss: false,
    },
    {
      uci: "d6e5",
      category: "win",
      dtz: 11,
      checkmate: false,
      stalemate: false,
      variant_win: false,
      variant_loss: false,
    },
    {
      uci: "d6c6",
      category: "draw",
      dtz: 30,
      checkmate: false,
      stalemate: false,
      variant_win: false,
      variant_loss: false,
    },
  ],
} satisfies AtomicTablebaseResponse;

describe("atomic tablebase selection", () => {
  it("keeps the best result category and maximizes its available distance", () => {
    expect(longestTablebaseDefenseUcis(response)).toEqual(["d6e5"]);
  });

  it("usually keeps the kings connected, using the longest connected defense", () => {
    const connectedUcis = new Set(["d6c5"]);

    expect(connectionAwareTablebaseDefenseUcis(response, connectedUcis, () => 0.25)).toEqual([
      "d6c5",
    ]);
    expect(connectionAwareTablebaseDefenseUcis(response, connectedUcis, () => 0.99)).toEqual([
      "d6c5",
    ]);
  });

  it("allows the longest disconnecting defense one quarter of the time", () => {
    expect(connectionAwareTablebaseDefenseUcis(response, new Set(["d6c5"]), () => 0.249)).toEqual([
      "d6e5",
    ]);
  });

  it("classifies decisive tablebase categories", () => {
    expect(tablebaseSideIsWinning("win")).toBe(true);
    expect(tablebaseSideIsLosing("loss")).toBe(true);
    expect(tablebaseSideIsWinning("draw")).toBe(false);
    expect(tablebaseSideIsLosing("draw")).toBe(false);
  });

  it("treats tablebase draws and stalemates as ended attempts", () => {
    expect(tablebasePositionIsDrawn({ ...response, category: "draw" })).toBe(true);
    expect(tablebasePositionIsDrawn({ ...response, stalemate: true })).toBe(true);
    expect(tablebasePositionIsDrawn(response)).toBe(false);
  });

  it("rejects winning starts that are mate in four or shorter", () => {
    const winningStart = (distance: number) => ({
      ...response,
      category: "win" as const,
      dtz: distance,
    });

    expect(tablebaseStartIsLongerThanMateInFour(winningStart(7))).toBe(false);
    expect(tablebaseStartIsLongerThanMateInFour(winningStart(8))).toBe(false);
    expect(tablebaseStartIsLongerThanMateInFour(winningStart(9))).toBe(true);
    expect(tablebaseStartIsLongerThanMateInFour(response)).toBe(false);
  });
});
