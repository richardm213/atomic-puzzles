import { appendBoardMove, createBoardHistory, historyContainsPosition } from "./boardHistory";

const append = (history: ReturnType<typeof createBoardHistory>, san: string): void => {
  appendBoardMove(history, {
    fen: `fen-${san}`,
    lastMove: ["e2", "e4"],
    uci: san.toLowerCase(),
    key: san.toLowerCase(),
    san,
  });
};

describe("board history", () => {
  it("creates aligned initial-position arrays", () => {
    expect(createBoardHistory("initial")).toEqual({
      plies: [{ fen: "initial" }],
      index: 0,
    });
  });

  it("truncates the abandoned continuation before appending a branch", () => {
    const history = createBoardHistory("initial");
    append(history, "e4");
    append(history, "e5");
    history.index = 1;

    append(history, "c5");

    expect(history.plies.map((ply) => ply.san).slice(1)).toEqual(["e4", "c5"]);
    expect(history.plies.map((ply) => ply.fen)).toEqual(["initial", "fen-e4", "fen-c5"]);
    expect(history.index).toBe(2);
  });

  it("matches repeated positions without considering move counters or future history", () => {
    const history = createBoardHistory("8/8/8/8/8/8/8/K6k w - - 0 1");
    append(history, "Ka2");
    history.plies[1]!.fen = "8/8/8/8/8/8/K7/7k b - - 1 1";
    append(history, "Kh2");
    history.index = 1;

    expect(historyContainsPosition(history, "8/8/8/8/8/8/K7/7k b - - 37 92")).toBe(true);
    expect(historyContainsPosition(history, history.plies[2]!.fen)).toBe(false);
  });
});
