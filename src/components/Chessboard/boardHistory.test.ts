import { appendBoardMove, createBoardHistory } from "./boardHistory";

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
});
