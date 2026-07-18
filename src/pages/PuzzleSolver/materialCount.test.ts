import { describe, expect, it } from "vitest";

import { materialCountFromFen } from "./materialCount";

describe("materialCountFromFen", () => {
  it("counts standard material values and excludes kings", () => {
    expect(materialCountFromFen("r3k2r/pp3ppp/4n3/8/8/8/PPP3PP/R3K2R w KQkq - 0 1")).toEqual({
      white: 15,
      black: 18,
      advantage: "black",
      difference: 3,
      whitePieces: [],
      blackPieces: ["knight"],
    });
  });

  it("reports equal starting material", () => {
    expect(
      materialCountFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    ).toEqual({
      white: 39,
      black: 39,
      advantage: null,
      difference: 0,
      whitePieces: [],
      blackPieces: [],
    });
  });

  it("represents cross-piece differences with icons for both sides", () => {
    expect(materialCountFromFen("4k2b/8/8/8/8/8/8/R3K3 w - - 0 1")).toMatchObject({
      whitePieces: ["rook"],
      blackPieces: ["bishop"],
    });
  });

  it("returns zero material for an empty value", () => {
    expect(materialCountFromFen(undefined)).toEqual({
      white: 0,
      black: 0,
      advantage: null,
      difference: 0,
      whitePieces: [],
      blackPieces: [],
    });
  });
});
