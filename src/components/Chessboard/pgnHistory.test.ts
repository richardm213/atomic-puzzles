import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";

import { buildPgnHistory } from "./pgnHistory";

describe("buildPgnHistory", () => {
  it("loads only the PGN mainline", () => {
    const result = buildPgnHistory(STARTING_FEN, "1. e4 e5 (1... c5) 2. Nf3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.history.plies.slice(1).map((ply) => ply.san)).toEqual(["e4", "e5", "Nf3"]);
    }
  });

  it("loads an atomic line with adjacent pieces removed by captures", () => {
    const result = buildPgnHistory(
      STARTING_FEN,
      "1. Nf3 f6 2. e4 e6 3. e5 Nc6 4. c3 Nd4 5. cxd4 Bb4 6. Nc3 d5 7. d4 Nh6 8. h3 Ng4 9. hxg4 h6 10. a3 fxe5 *",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.history.plies.at(-1)?.fen).toBe(
        "r1bqk2r/ppp3p1/4p2p/3p4/1b1P4/P1N5/1P3PP1/R1BQKB1R w KQkq - 0 11",
      );
    }
  });

  it("distinguishes invalid FEN and PGN errors", () => {
    expect(buildPgnHistory("bad", "1. e4")).toMatchObject({ ok: false, kind: "fen" });
    expect(buildPgnHistory(STARTING_FEN, "1. Bxh8")).toMatchObject({
      ok: false,
      kind: "pgn",
    });
  });
});
