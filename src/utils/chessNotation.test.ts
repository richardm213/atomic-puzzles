import { describe, expect, it } from "vitest";

import { numberedSanLineFromUci, sanLineFromUci } from "./chessNotation";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("chess notation", () => {
  it("converts a sequential atomic UCI principal variation to SAN", () => {
    expect(sanLineFromUci(STARTING_FEN, ["g1f3", "f7f6", "e2e3", "d7d5", "f3g5"])).toEqual([
      "Nf3",
      "f6",
      "e3",
      "d5",
      "Ng5",
    ]);
  });

  it("stops before an invalid continuation instead of showing a false line", () => {
    expect(sanLineFromUci(STARTING_FEN, ["g1f3", "g1h3", "e2e3"])).toEqual(["Nf3"]);
  });

  it("numbers a five-ply line from White's current fullmove", () => {
    expect(
      numberedSanLineFromUci(STARTING_FEN, ["g1f3", "f7f6", "e2e3", "d7d5", "f3g5"])
        .map((token) => token.value)
        .join(" "),
    ).toBe("1. Nf3 f6 2. e3 d5 3. Ng5");
  });

  it("uses an ellipsis when a line starts with Black to move", () => {
    const blackToMove = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12";
    expect(
      numberedSanLineFromUci(blackToMove, ["f7f6", "g1f3", "d7d5"])
        .map((token) => token.value)
        .join(" "),
    ).toBe("12... f6 13. Nf3 d5");
  });
});
