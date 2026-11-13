import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";

import chesscomSpacedKnightPgn from "./fixtures/chesscom-spaced-knight.pgn?raw";
import { buildPgnHistory } from "./pgnHistory";

describe("buildPgnHistory", () => {
  it("loads all 54 moves of pasted Chess.com PGN with a split N 1c3 token", () => {
    const result = buildPgnHistory(STARTING_FEN, chesscomSpacedKnightPgn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.history.plies).toHaveLength(109);
    expect(result.history.plies[13]).toMatchObject({ uci: "b1c3", san: "N1c3" });
    expect(result.history.plies.at(-1)).toMatchObject({
      san: "Kd7",
      fen: "8/3k1K2/6p1/3p2Pp/3Pp2P/4P3/8/8 w - - 1 55",
    });
  });

  it.each(["1. e4 e5 (1... c5) 2. Nf3", "e2e4 e7e5 (c7c5) g1f3"])(
    "loads the mainline and variations from SAN or UCI: %s",
    (pgn) => {
      const result = buildPgnHistory(STARTING_FEN, pgn);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.history.plies.slice(1).map((ply) => ply.san)).toEqual(["e4", "e5", "Nf3"]);
        expect(
          result.histories.map((history) => history.plies.slice(1).map((ply) => ply.san)),
        ).toEqual([
          ["e4", "e5", "Nf3"],
          ["e4", "c5"],
        ]);
      }
    },
  );

  it("loads nested PGN variations", () => {
    const result = buildPgnHistory(STARTING_FEN, "1. e4 e5 (1... c5 2. Nf3 (2. d4)) 2. Nf3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.histories.map((history) => history.plies.slice(1).map((ply) => ply.san)),
      ).toEqual(
        expect.arrayContaining([
          ["e4", "e5", "Nf3"],
          ["e4", "c5", "Nf3"],
          ["e4", "c5", "d4"],
        ]),
      );
    }
  });

  it("preserves move annotations while loading PGN", () => {
    const result = buildPgnHistory(STARTING_FEN, "1. e4? e5 2. Nf3!");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.history.plies.slice(1).map((ply) => ply.san)).toEqual(["e4?", "e5", "Nf3"]);
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

  it("loads a complete atomic puzzle PGN from its setup position", () => {
    const fen = "rn3r1k/pp6/2p4p/3p4/3P3P/8/PPP1pR2/4R1K1 w - - 0 23";
    const result = buildPgnHistory(
      fen,
      `[Event "Atomic Puzzle 176"]
[Variant "Atomic"]
[SetUp "1"]
[FEN "${fen}"]

23. Rg2 Rf1+ 24. Rexe2 h5 25. Rg8+ Kh7
24. Rg7+ (26. Rh8+ Kg7 27. Rh7+ Kg8 28. Rxb7)
26... Kh8 27. Rxb7 *`,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.history.plies.slice(1).map((ply) => ply.san)).toEqual([
        "Rg2",
        "Rf1+",
        "Rexe2",
        "h5",
        "Rg8+",
        "Kh7",
        "Rg7+",
        "Kh8",
        "Rxb7",
      ]);
      expect(result.histories).toHaveLength(2);
    }
  });

  it("loads an empty PGN document without mistaking comments for variations", () => {
    const result = buildPgnHistory(STARTING_FEN, '[Event "Example (empty)"]\n{ No moves (yet) } *');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.history.plies).toHaveLength(1);
  });

  it("distinguishes invalid FEN and PGN errors", () => {
    expect(buildPgnHistory("bad", "1. e4")).toMatchObject({ ok: false, kind: "fen" });
    expect(buildPgnHistory(STARTING_FEN, "1. Bxh8")).toMatchObject({
      ok: false,
      kind: "pgn",
    });
  });
});
