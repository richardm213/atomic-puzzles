import { describe, expect, it } from "vitest";

import type { AtomicTablebaseResponse } from "../atomicTablebase/lichessAtomicTablebase";
import {
  chooseEqualTablebaseDefense,
  classifyTablebaseStart,
  equalBestTablebaseDefenseUcis,
} from "./tablebaseDefense";

const move = (
  uci: string,
  category: AtomicTablebaseResponse["moves"][number]["category"],
  dtz: number,
): AtomicTablebaseResponse["moves"][number] => ({
  uci,
  category,
  dtz,
  zeroing: false,
  checkmate: false,
  stalemate: false,
  variant_win: false,
  variant_loss: false,
});

const response: AtomicTablebaseResponse = {
  category: "loss",
  dtz: -7,
  checkmate: false,
  stalemate: false,
  variant_win: false,
  variant_loss: false,
  moves: [
    move("d6e6", "win", 8),
    move("d6c6", "win", 8),
    move("d6e5", "win", 6),
    move("d6c5", "draw", 20),
  ],
};

describe("tablebase endgame defense", () => {
  it("keeps only moves with the same tablebase result and DTZ as the top move", () => {
    expect(equalBestTablebaseDefenseUcis(response)).toEqual(["d6e6", "d6c6"]);
  });

  it("selects uniformly among tablebase-equal defenses", () => {
    expect(chooseEqualTablebaseDefense(response, () => 0)).toBe("d6e6");
    expect(chooseEqualTablebaseDefense(response, () => 0.99)).toBe("d6c6");
  });
});

describe("KRB tablebase start validation", () => {
  it("accepts a proven win with enough DTZ margin without engine analysis", () => {
    expect(
      classifyTablebaseStart("rook-bishop-vs-king", { ...response, category: "win", dtz: 13 }),
    ).toBe("accept");
  });
  it("preserves winning starts when DTZ is small or unknown and leaves other endgames to the engine", () => {
    for (const dtz of [11, 9, null]) {
      expect(
        classifyTablebaseStart("rook-bishop-vs-king", { ...response, category: "win", dtz }),
      ).toBe("engine");
    }
    expect(
      classifyTablebaseStart("rook-bishop-vs-king", {
        ...response,
        category: "unknown",
        dtz: null,
      }),
    ).toBe("engine");
    expect(classifyTablebaseStart("rook-vs-pawn", { ...response, category: "win", dtz: 13 })).toBe(
      "engine",
    );
  });
  it("rejects tablebase draws and losses", () => {
    for (const category of ["draw", "loss"] as const) {
      expect(classifyTablebaseStart("rook-bishop-vs-king", { ...response, category })).toBe(
        "reject",
      );
    }
  });
});
