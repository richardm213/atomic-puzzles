import { describe, expect, it } from "vitest";

import { inferAtomic960InitialFen } from "../../../shared/domain/chess/initialFen";

describe("inferAtomic960InitialFen", () => {
  it("recovers the archived PyChess Atomic960 starting position", () => {
    const moves =
      "d2d3 g7g5 d3d4 b7b6 g2g3 d7d5 e1b4 e8a4 b4a4 c8h3 f1e3 h8d4 d1c3 a7a6 h1d5 c7c6 g1d1 d8e6 d1d8 e6d8 c3e4 b8a8 c1d2 h3f1 a2a3 f1e2 e4d2 f8e6 b1a2 e6d4 a1e1 d4c2".split(
        " ",
      );

    expect(inferAtomic960InitialFen(moves)).toBe(
      "rkbnqnrb/pppppppp/8/8/8/8/PPPPPPPP/RKBNQNRB w AGag - 0 1",
    );
  });

  it("does not guess when pawn moves fit more than one setup", () => {
    expect(inferAtomic960InitialFen(["e2e4", "e7e5"])).toBeNull();
  });

  it("returns null without moves", () => {
    expect(inferAtomic960InitialFen(null)).toBeNull();
  });
});
