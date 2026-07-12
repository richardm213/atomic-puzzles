import { buildPgnHistory } from "./pgnHistory";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("buildPgnHistory", () => {
  it("loads only the PGN mainline", () => {
    const result = buildPgnHistory(STARTING_FEN, "1. e4 e5 (1... c5) 2. Nf3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.history.plies.slice(1).map((ply) => ply.san)).toEqual(["e4", "e5", "Nf3"]);
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
