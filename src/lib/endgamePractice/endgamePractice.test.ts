import { parseFen } from "chessops/fen";
import { describe, expect, it } from "vitest";

import {
  buildEndgamePgn,
  chooseDefenderMove,
  connectedDefenderMoveUcis,
  defenderReplyFens,
  generateEndgamePosition,
  hasBlackPawn,
  hasImmediateWhiteWinFromFen,
  hasSafeRookContinuation,
  pawnEndgameCategories,
} from "./endgamePractice";

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

  it("keeps the starting position and includes the complete played move line", () => {
    const fen = "8/8/8/2pk4/2PK4/8/Q7/8 w - - 0 1";

    expect(buildEndgamePgn(fen, ["Qe7+", "Kc6", "Qd8"])).toBe(
      `[Variant "Atomic"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n1. Qe7+ Kc6 2. Qd8 *`,
    );
  });

  it("identifies defender moves that keep the kings connected", () => {
    const fen = "8/8/8/2pk4/2PK4/8/Q7/8 b - - 0 1";
    const connected = connectedDefenderMoveUcis(fen, new Set(["d5e5", "d5e6"]));

    expect(connected.has("d5e5")).toBe(true);
    expect(connected.has("d5e6")).toBe(false);
  });

  it("generates playable positions for both endgame modes", () => {
    for (const mode of ["pawn-duel", "blockade"] as const) {
      const generated = generateEndgamePosition(mode, "regular-file:rank-regular", () => 0.42);
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

  it.each([
    ["rook-vs-pawn", ["K", "R", "k", "p"]],
    ["rook-bishop-vs-king", ["K", "R", "B", "k"]],
    ["rook-pawn-vs-king", ["K", "R", "P", "k"]],
  ] as const)("generates legal %s material without an immediate win", (mode, expectedSymbols) => {
    const generated = generateEndgamePosition(mode, "no-pawn", () => 0.42);
    const setup = parseFen(generated.fen);
    expect(setup.isOk).toBe(true);
    if (setup.isErr) return;

    const symbols = Array.from({ length: 64 }, (_, square) => {
      const piece = setup.value.board.get(square);
      if (!piece) return null;
      const symbol = piece.role === "knight" ? "N" : piece.role[0]?.toUpperCase();
      return piece.color === "white" ? symbol : symbol?.toLowerCase();
    })
      .filter((symbol): symbol is string => Boolean(symbol))
      .sort();

    expect(symbols).toEqual([...expectedSymbols].sort());
    expect(generated.category).toBe("no-pawn");
    expect(hasImmediateWhiteWinFromFen(generated.fen)).toBe(false);
  });

  it("generates KRP vs KP with blocked pawns", () => {
    const generated = generateEndgamePosition(
      "rook-pawn-vs-pawn",
      "regular-file:rank-regular",
      () => 0.42,
    );
    const setup = parseFen(generated.fen);
    expect(setup.isOk).toBe(true);
    if (setup.isErr) return;

    const pawns = Array.from({ length: 64 }, (_, square) => ({
      square,
      piece: setup.value.board.get(square),
    })).filter(({ piece }) => piece?.role === "pawn");
    const whitePawn = pawns.find(({ piece }) => piece?.color === "white");
    const blackPawn = pawns.find(({ piece }) => piece?.color === "black");
    const whiteRooks = Array.from({ length: 64 }, (_, square) =>
      setup.value.board.get(square),
    ).filter((piece) => piece?.color === "white" && piece.role === "rook");

    expect(whiteRooks).toHaveLength(1);
    expect(whitePawn).toBeDefined();
    expect(blackPawn).toBeDefined();
    if (!whitePawn || !blackPawn) return;
    expect(whitePawn.square % 8).toBe(blackPawn.square % 8);
    expect(Math.floor(blackPawn.square / 8)).toBe(Math.floor(whitePawn.square / 8) + 1);
    expect(hasImmediateWhiteWinFromFen(generated.fen)).toBe(false);
  });

  it("starts KRB vs K with the rook cutting off a distant defending king", () => {
    const generated = generateEndgamePosition("rook-bishop-vs-king", "no-pawn", () => 0.42);
    const setup = parseFen(generated.fen);
    expect(setup.isOk).toBe(true);
    if (setup.isErr) return;

    const findSquare = (color: "white" | "black", role: "king" | "rook" | "bishop") =>
      Array.from({ length: 64 }, (_, square) => square).find((square) => {
        const piece = setup.value.board.get(square);
        return piece?.color === color && piece.role === role;
      });
    const whiteKing = findSquare("white", "king");
    const blackKing = findSquare("black", "king");
    const rook = findSquare("white", "rook");
    const bishop = findSquare("white", "bishop");
    expect(whiteKing).toBeDefined();
    expect(blackKing).toBeDefined();
    expect(rook).toBeDefined();
    expect(bishop).toBeDefined();
    if (
      whiteKing === undefined ||
      blackKing === undefined ||
      rook === undefined ||
      bishop === undefined
    ) {
      return;
    }

    const rookFile = rook % 8;
    const rookRank = Math.floor(rook / 8);
    const cutsFiles =
      Math.min(whiteKing % 8, blackKing % 8) < rookFile &&
      rookFile < Math.max(whiteKing % 8, blackKing % 8);
    const cutsRanks =
      Math.min(Math.floor(whiteKing / 8), Math.floor(blackKing / 8)) < rookRank &&
      rookRank < Math.max(Math.floor(whiteKing / 8), Math.floor(blackKing / 8));
    expect(kingDistance(whiteKing, blackKing)).toBeGreaterThanOrEqual(4);
    expect(cutsFiles || cutsRanks).toBe(true);
    expect(bishop % 8 === rookFile || Math.floor(bishop / 8) === rookRank).toBe(false);
  });

  it("enumerates every non-terminal defender reply position for tablebase warming", () => {
    const generated = generateEndgamePosition(
      "rook-pawn-vs-pawn",
      "regular-file:rank-regular",
      () => 0.42,
    );
    const replies = defenderReplyFens(generated.fen);

    expect(replies.length).toBeGreaterThan(0);
    expect(new Set(replies).size).toBe(replies.length);
    expect(replies.every((reply) => reply.includes(" b "))).toBe(true);
  });

  it("always places facing pawns in a reachable atomic orientation", () => {
    let seed = 9;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };

    for (const category of pawnEndgameCategories) {
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

  it("categorizes enemy pawn rank and file independently", () => {
    const expectedFiles = {
      "rook-file": new Set([0, 7]),
      "knight-file": new Set([1, 6]),
      "regular-file": new Set([2, 3, 4, 5]),
    };
    const expectedRanks = {
      "rank-3": new Set([3]),
      "rank-regular": new Set([4, 5, 6]),
      "rank-7": new Set([7]),
    };

    for (const category of pawnEndgameCategories) {
      const generated = generateEndgamePosition("blockade", category, () => 0.42);
      const pawn = pieceSquare(generated.fen, "black", "pawn");
      expect(pawn).toBeDefined();
      if (pawn === undefined) continue;
      const [fileCategory, rankCategory] = category.split(":") as [
        keyof typeof expectedFiles,
        keyof typeof expectedRanks,
      ];
      expect(expectedFiles[fileCategory].has(pawn % 8)).toBe(true);
      expect(expectedRanks[rankCategory].has(Math.floor(pawn / 8) + 1)).toBe(true);
    }
  });

  it("never puts the blockaded black pawn on its impossible eighth rank", () => {
    for (const category of pawnEndgameCategories) {
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
        const generated = generateEndgamePosition(mode, "regular-file:rank-regular", random);
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
    const generated = generateEndgamePosition("blockade", "regular-file:rank-regular", () => 0.3);
    expect(chooseDefenderMove(generated.fen, () => 0.5)).toBeNull();
  });
});

describe("rook candidate material screening", () => {
  it("rejects a lone rook against a bare king but keeps a viable promotion route", () => {
    expect(hasSafeRookContinuation("7k/8/8/8/8/8/8/KR6 w - - 0 1")).toBe(false);
    expect(hasSafeRookContinuation("7k/8/8/8/8/8/P7/KR6 w - - 0 1")).toBe(true);
  });
});

it("keeps KRB rook boxes roomy without excluding narrow boxes of sufficient area", () => {
  let seed = 57;
  const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
  const areas = new Set<number>();
  for (let sample = 0; sample < 200; sample += 1) {
    const generated = generateEndgamePosition("rook-bishop-vs-king", "no-pawn", random);
    const setup = parseFen(generated.fen).unwrap();
    const rook = [...setup.board.pieces("white", "rook")][0]!;
    const king = setup.board.kingOf("black")!;
    const width = king % 8 < rook % 8 ? rook % 8 : 7 - (rook % 8);
    const height =
      Math.floor(king / 8) < Math.floor(rook / 8) ? Math.floor(rook / 8) : 7 - Math.floor(rook / 8);
    expect(width * height).toBeGreaterThanOrEqual(6);
    areas.add(width * height);
  }
  expect(areas.has(6)).toBe(true);
  expect(areas.has(8)).toBe(true);
});
