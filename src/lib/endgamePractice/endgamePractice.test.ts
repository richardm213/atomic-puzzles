import { parseFen } from "chessops/fen";
import { describe, expect, it } from "vitest";

import {
  buildEndgamePgn,
  chooseDefenderMove,
  connectedDefenderMoveUcis,
  type EndgameCategory,
  generateEndgamePosition,
  hasBlackPawn,
  hasImmediateWhiteWinFromFen,
} from "./endgamePractice";

const categories: EndgameCategory[] = ["rank-3", "rank-4", "rank-5", "rank-6", "a-pawn", "h-pawn"];

const pieceSquare = (
  fen: string,
  color: "white" | "black",
  role: "king" | "pawn",
): number | undefined => {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  return Array.from({ length: 64 }, (_, square) => square).find((square) => {
    const piece = setup.value.board.get(square);
    return piece?.color === color && piece.role === role;
  });
};

const kingDistance = (left: number, right: number): number =>
  Math.max(
    Math.abs((left % 8) - (right % 8)),
    Math.abs(Math.floor(left / 8) - Math.floor(right / 8)),
  );

describe("endgame practice positions", () => {
  it("builds an Atomic PGN that opens from the exact position", () => {
    const fen = "8/8/8/3kp3/3PK3/8/Q7/8 w - - 0 1";

    expect(buildEndgamePgn(fen)).toBe(`[Variant "Atomic"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n*`);
  });

  it("identifies defender moves that keep the kings connected", () => {
    const fen = "8/8/8/2pk4/2PK4/8/Q7/8 b - - 0 1";
    const connected = connectedDefenderMoveUcis(fen, new Set(["d5e5", "d5e6"]));

    expect(connected.has("d5e5")).toBe(true);
    expect(connected.has("d5e6")).toBe(false);
  });

  it("generates playable positions for both endgame modes", () => {
    for (const mode of ["pawn-duel", "blockade"] as const) {
      const generated = generateEndgamePosition(mode, "rank-6", () => 0.42);
      expect(generated.fen).toContain(" w ");
      expect(generated.fen).toContain("Q");
      expect(hasBlackPawn(generated.fen)).toBe(true);
      expect(hasImmediateWhiteWinFromFen(generated.fen)).toBe(false);
      const whiteKing = pieceSquare(generated.fen, "white", "king");
      const blackKing = pieceSquare(generated.fen, "black", "king");
      expect(whiteKing).toBeDefined();
      expect(blackKing).toBeDefined();
      expect(kingDistance(whiteKing ?? 0, blackKing ?? 63)).toBe(1);
    }
  });

  it("generates KQQ vs K with connected kings and queens on distinct random squares", () => {
    const generated = generateEndgamePosition("two-queens", "no-pawn", () => 0.42);
    const setup = parseFen(generated.fen);
    expect(setup.isOk).toBe(true);
    if (setup.isErr) return;

    const pieces = Array.from({ length: 64 }, (_, square) => ({
      square,
      piece: setup.value.board.get(square),
    })).filter(({ piece }) => piece);
    const queens = pieces.filter(({ piece }) => piece?.color === "white" && piece.role === "queen");
    const pawns = pieces.filter(({ piece }) => piece?.role === "pawn");
    const whiteKing = pieceSquare(generated.fen, "white", "king");
    const blackKing = pieceSquare(generated.fen, "black", "king");

    expect(queens).toHaveLength(2);
    expect(new Set(queens.map(({ square }) => square)).size).toBe(2);
    expect(pawns).toHaveLength(0);
    expect(whiteKing).toBeDefined();
    expect(blackKing).toBeDefined();
    expect(kingDistance(whiteKing ?? 0, blackKing ?? 63)).toBe(1);
    expect(hasImmediateWhiteWinFromFen(generated.fen)).toBe(false);
  });

  it("always places facing pawns in a reachable atomic orientation", () => {
    let seed = 9;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };

    for (const category of categories) {
      for (let sample = 0; sample < 8; sample += 1) {
        const generated = generateEndgamePosition("pawn-duel", category, random);
        expect(hasImmediateWhiteWinFromFen(generated.fen)).toBe(false);
        const setup = parseFen(generated.fen);
        expect(setup.isOk).toBe(true);
        if (setup.isErr) continue;

        const pawns = Array.from({ length: 64 }, (_, square) => ({
          square,
          piece: setup.value.board.get(square),
        })).filter(({ piece }) => piece?.role === "pawn");
        const whitePawn = pawns.find(({ piece }) => piece?.color === "white");
        const blackPawn = pawns.find(({ piece }) => piece?.color === "black");
        expect(whitePawn).toBeDefined();
        expect(blackPawn).toBeDefined();
        if (!whitePawn || !blackPawn) continue;

        const whiteRank = Math.floor(whitePawn.square / 8) + 1;
        const blackRank = Math.floor(blackPawn.square / 8) + 1;
        expect(whitePawn.square % 8).toBe(blackPawn.square % 8);
        expect(blackRank).toBe(whiteRank + 1);
        expect(whiteRank).toBeGreaterThan(1);
        expect(blackRank).toBeLessThan(8);
      }
    }
  });

  it("never puts the blockaded black pawn on its impossible eighth rank", () => {
    for (const category of categories) {
      const generated = generateEndgamePosition("blockade", category, () => 0.99);
      expect(hasImmediateWhiteWinFromFen(generated.fen)).toBe(false);
      const setup = parseFen(generated.fen);
      expect(setup.isOk).toBe(true);
      if (setup.isErr) continue;
      const blackPawnSquare = Array.from({ length: 64 }, (_, square) => square).find((square) => {
        const piece = setup.value.board.get(square);
        return piece?.role === "pawn" && piece.color === "black";
      });
      expect(blackPawnSquare).toBeDefined();
      expect(Math.floor((blackPawnSquare ?? 63) / 8) + 1).toBeLessThan(8);
      const whiteKingSquare = pieceSquare(generated.fen, "white", "king");
      expect(whiteKingSquare).toBeDefined();
      expect((whiteKingSquare ?? 1) % 8).toBe((blackPawnSquare ?? 0) % 8);
      expect(Math.floor((blackPawnSquare ?? 0) / 8) - Math.floor((whiteKingSquare ?? 63) / 8)).toBe(
        1,
      );
    }
  });

  it("varies the connected king arrangement around the pawns", () => {
    let seed = 27;
    const random = () => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed / 2_147_483_647;
    };

    for (const mode of ["pawn-duel", "blockade"] as const) {
      const arrangements = new Set<string>();
      for (let sample = 0; sample < 12; sample += 1) {
        const generated = generateEndgamePosition(mode, "rank-5", random);
        const anchor = pieceSquare(generated.fen, mode === "pawn-duel" ? "white" : "black", "pawn");
        const whiteKing = pieceSquare(generated.fen, "white", "king");
        const blackKing = pieceSquare(generated.fen, "black", "king");
        if (anchor === undefined || whiteKing === undefined || blackKing === undefined) continue;
        const offset = (square: number) =>
          `${(square % 8) - (anchor % 8)},${Math.floor(square / 8) - Math.floor(anchor / 8)}`;
        arrangements.add(`${offset(whiteKing)}:${offset(blackKing)}`);
      }
      expect(arrangements.size).toBeGreaterThan(1);
    }
  });
});

describe("endgame defender", () => {
  it("returns no move when it is not the defender's turn", () => {
    const generated = generateEndgamePosition("blockade", "rank-5", () => 0.3);
    expect(chooseDefenderMove(generated.fen, () => 0.5)).toBeNull();
  });
});
