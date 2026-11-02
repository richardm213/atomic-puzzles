import { describe, expect, it } from "vitest";

import type { AtomicTablebaseResponse } from "../atomicTablebase/lichessAtomicTablebase";
import { chooseEqualTablebaseDefense, equalBestTablebaseDefenseUcis } from "./tablebaseDefense";

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
