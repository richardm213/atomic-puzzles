import type { Move } from "chessops";
import { makeFen, parseFen } from "chessops/fen";
import { makeUci } from "chessops/util";
import { Atomic } from "chessops/variant";

export type EndgameMode = "pawn-duel" | "blockade" | "two-queens";
export type EndgameCategory =
  "rank-3" | "rank-4" | "rank-5" | "rank-6" | "a-pawn" | "h-pawn" | "no-pawn";

export type EndgamePosition = {
  fen: string;
  mode: EndgameMode;
  category: EndgameCategory;
  pawnSquare: string | null;
};

export const buildEndgamePgn = (fen: string): string =>
  ['[Variant "Atomic"]', '[SetUp "1"]', `[FEN "${fen}"]`, "", "*"].join("\n");

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const centralFiles = ["b", "c", "d", "e", "f", "g"] as const;
const ranks = [3, 4, 5, 6] as const;
const boardSquares = files.flatMap((file) =>
  Array.from({ length: 8 }, (_, index) => `${file}${index + 1}`),
);

const choice = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))] as T;

const squareDistance = (left: string, right: string): number => {
  const leftFile = files.indexOf(left[0] as (typeof files)[number]);
  const rightFile = files.indexOf(right[0] as (typeof files)[number]);
  return Math.max(Math.abs(leftFile - rightFile), Math.abs(Number(left[1]) - Number(right[1])));
};

const square = (fileIndex: number, rank: number): string => `${files[fileIndex]}${rank}`;

type KingSquare = { fileIndex: number; rank: number; name: string };

const adjacentSquares = (fileIndex: number, rank: number): KingSquare[] => {
  const squares: KingSquare[] = [];
  for (let fileOffset = -1; fileOffset <= 1; fileOffset += 1) {
    for (let rankOffset = -1; rankOffset <= 1; rankOffset += 1) {
      if (fileOffset === 0 && rankOffset === 0) continue;
      const nextFile = fileIndex + fileOffset;
      const nextRank = rank + rankOffset;
      if (nextFile < 0 || nextFile > 7 || nextRank < 1 || nextRank > 8) continue;
      squares.push({ fileIndex: nextFile, rank: nextRank, name: square(nextFile, nextRank) });
    }
  }
  return squares;
};

const connectedKingPairs = (
  mode: EndgameMode,
  fileIndex: number,
  rank: number,
): Array<{ whiteKing: string; blackKing: string }> => {
  const whitePawn = mode === "pawn-duel" ? square(fileIndex, rank) : null;
  const blackPawn = square(fileIndex, mode === "pawn-duel" ? rank + 1 : rank);
  const whiteCandidates =
    mode === "pawn-duel"
      ? adjacentSquares(fileIndex, rank)
      : [{ fileIndex, rank: rank - 1, name: square(fileIndex, rank - 1) }];
  const blackCandidates = adjacentSquares(fileIndex, mode === "pawn-duel" ? rank + 1 : rank);

  return whiteCandidates.flatMap((whiteKing) =>
    blackCandidates.flatMap((blackKing) => {
      const kingsAreConnected =
        Math.max(
          Math.abs(whiteKing.fileIndex - blackKing.fileIndex),
          Math.abs(whiteKing.rank - blackKing.rank),
        ) === 1;
      return whiteKing.name !== blackKing.name &&
        ![whitePawn, blackPawn].includes(whiteKing.name) &&
        ![whitePawn, blackPawn].includes(blackKing.name) &&
        kingsAreConnected
        ? [{ whiteKing: whiteKing.name, blackKing: blackKing.name }]
        : [];
    }),
  );
};

const buildFen = (pieces: Array<{ square: string; symbol: string }>, turn = "w"): string => {
  const bySquare = new Map(pieces.map((piece) => [piece.square, piece.symbol]));
  const board = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let empty = 0;
    let row = "";
    for (const file of files) {
      const piece = bySquare.get(`${file}${rank}`);
      if (piece) {
        if (empty) row += String(empty);
        row += piece;
        empty = 0;
      } else {
        empty += 1;
      }
    }
    if (empty) row += String(empty);
    board.push(row);
  }
  return `${board.join("/")} ${turn} - - 0 1`;
};

const isQueenAligned = (queen: string, king: string): boolean => {
  const fileDistance = Math.abs(files.indexOf(queen[0] as never) - files.indexOf(king[0] as never));
  const rankDistance = Math.abs(Number(queen[1]) - Number(king[1]));
  return fileDistance === 0 || rankDistance === 0 || fileDistance === rankDistance;
};

const isUsableFen = (fen: string): boolean => {
  const setup = parseFen(fen);
  if (setup.isErr) return false;
  const position = Atomic.fromSetup(setup.value);
  return position.isOk && !position.value.outcome();
};

const categoryRankAndFile = (
  category: EndgameCategory,
  random: () => number,
): { rank: number; fileIndex: number } => {
  if (category === "no-pawn") return { rank: 4, fileIndex: 3 };
  if (category === "a-pawn") return { rank: choice(ranks, random), fileIndex: 0 };
  if (category === "h-pawn") return { rank: choice(ranks, random), fileIndex: 7 };
  return {
    rank: Number(category.slice(-1)),
    fileIndex: files.indexOf(choice(centralFiles, random)),
  };
};

const generateTwoQueenPosition = (random: () => number): EndgamePosition => {
  const kingPairs = boardSquares.flatMap((whiteKing) => {
    const whiteFile = files.indexOf(whiteKing[0] as (typeof files)[number]);
    const whiteRank = Number(whiteKing[1]);
    return adjacentSquares(whiteFile, whiteRank).map((blackKing) => ({
      whiteKing,
      blackKing: blackKing.name,
    }));
  });
  const pairOffset = Math.floor(random() * kingPairs.length);
  const queenOffset = Math.floor(random() * boardSquares.length);

  for (let attempt = 0; attempt < 4_000; attempt += 1) {
    const pair = kingPairs[(pairOffset + attempt) % kingPairs.length];
    if (!pair) continue;
    const freeSquares = boardSquares.filter(
      (candidate) => candidate !== pair.whiteKing && candidate !== pair.blackKing,
    );
    const firstQueen = freeSquares[(queenOffset + attempt * 17) % freeSquares.length];
    if (!firstQueen) continue;
    const secondQueenSquares = freeSquares.filter((candidate) => candidate !== firstQueen);
    const secondQueen =
      secondQueenSquares[(queenOffset + attempt * 31) % secondQueenSquares.length];
    if (!secondQueen) continue;
    const fen = buildFen([
      { square: pair.whiteKing, symbol: "K" },
      { square: firstQueen, symbol: "Q" },
      { square: secondQueen, symbol: "Q" },
      { square: pair.blackKing, symbol: "k" },
    ]);
    if (isUsableFen(fen) && !hasImmediateWhiteWinFromFen(fen)) {
      return { fen, mode: "two-queens", category: "no-pawn", pawnSquare: null };
    }
  }

  throw new Error("Could not generate a legal two-queen endgame position.");
};

export const generateEndgamePosition = (
  mode: EndgameMode,
  category: EndgameCategory,
  random: () => number = Math.random,
): EndgamePosition => {
  if (mode === "two-queens") return generateTwoQueenPosition(random);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const { rank, fileIndex } = categoryRankAndFile(category, random);
    const pawnSquare = square(fileIndex, rank);
    const blackPawn = mode === "pawn-duel" ? square(fileIndex, rank + 1) : pawnSquare;
    const whitePawn = mode === "pawn-duel" ? pawnSquare : null;

    const kingPairs = connectedKingPairs(mode, fileIndex, rank);
    const pairOffset = Math.floor(random() * kingPairs.length);
    for (let pairIndex = 0; pairIndex < kingPairs.length; pairIndex += 1) {
      const pair = kingPairs[(pairOffset + pairIndex) % kingPairs.length];
      if (!pair) continue;
      const { whiteKing, blackKing } = pair;
      const queenSquares = files.flatMap((file) =>
        Array.from({ length: 8 }, (_, index) => `${file}${index + 1}`),
      );
      const validQueenSquares = queenSquares.filter(
        (candidate) =>
          ![whiteKing, blackKing, blackPawn, whitePawn].includes(candidate) &&
          squareDistance(candidate, whiteKing) >= 3 &&
          squareDistance(candidate, blackKing) >= 3 &&
          !isQueenAligned(candidate, blackKing),
      );
      const safePositions = validQueenSquares.flatMap((queen) => {
        const pieces = [
          { square: whiteKing, symbol: "K" },
          { square: queen, symbol: "Q" },
          { square: blackKing, symbol: "k" },
          { square: blackPawn, symbol: "p" },
          ...(whitePawn ? [{ square: whitePawn, symbol: "P" }] : []),
        ];
        const fen = buildFen(pieces);
        return isUsableFen(fen) && !hasImmediateWhiteWinFromFen(fen) ? [fen] : [];
      });
      if (safePositions.length) {
        return { fen: choice(safePositions, random), mode, category, pawnSquare };
      }
    }
  }

  throw new Error("Could not generate a legal endgame position.");
};

const createPosition = (fen: string): Atomic | null => {
  const setup = parseFen(fen);
  if (setup.isErr) return null;
  const position = Atomic.fromSetup(setup.value);
  return position.isOk ? position.value : null;
};

const legalMoves = (position: Atomic): Move[] => {
  const moves: Move[] = [];
  for (const [from, destinations] of position.allDests()) {
    const piece = position.board.get(from);
    for (const to of destinations) {
      const promotionRank = Math.floor(to / 8);
      if (piece?.role === "pawn" && (promotionRank === 0 || promotionRank === 7)) {
        moves.push({ from, to, promotion: "queen" });
      } else {
        moves.push({ from, to });
      }
    }
  }
  return moves;
};

const hasImmediateWhiteWin = (position: Atomic): boolean => {
  if (position.turn !== "white") return false;
  return legalMoves(position).some((move) => {
    const next = createPosition(makeFen(position.toSetup()));
    if (!next) return false;
    next.play(move);
    return next.outcome()?.winner === "white";
  });
};

export const hasImmediateWhiteWinFromFen = (fen: string): boolean => {
  const position = createPosition(fen);
  return position ? hasImmediateWhiteWin(position) : false;
};

const findPieceSquare = (position: Atomic, color: "white" | "black", role: "king" | "pawn") => {
  for (let index = 0; index < 64; index += 1) {
    const piece = position.board.get(index);
    if (piece?.color === color && piece.role === role) return index;
  }
  return null;
};

const indexDistance = (left: number, right: number): number =>
  Math.max(
    Math.abs((left % 8) - (right % 8)),
    Math.abs(Math.floor(left / 8) - Math.floor(right / 8)),
  );

export const chooseDefenderMove = (
  fen: string,
  random: () => number = Math.random,
  allowedUcis?: ReadonlySet<string>,
): string | null => {
  const position = createPosition(fen);
  if (!position || position.turn !== "black") return null;

  const candidates = legalMoves(position)
    .filter((move) => !allowedUcis || allowedUcis.has(makeUci(move)))
    .map((move) => {
      const next = createPosition(fen);
      if (!next) return { move, score: -Infinity };
      next.play(move);
      const outcome = next.outcome();
      const whiteKing = findPieceSquare(next, "white", "king");
      const blackKing = findPieceSquare(next, "black", "king");
      const blackPawn = findPieceSquare(next, "black", "pawn");
      const connected =
        whiteKing !== null && blackKing !== null && indexDistance(whiteKing, blackKing) <= 1;
      const allowsMateInOne = !outcome && hasImmediateWhiteWin(next);
      const score =
        (outcome?.winner === "black" ? 10_000 : 0) +
        (allowsMateInOne ? -5_000 : 0) +
        (connected ? 120 : 0) +
        (blackPawn === null ? -1_000 : 0) +
        random();
      return { move, score };
    });

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  return best ? makeUci(best.move) : null;
};

export const connectedDefenderMoveUcis = (
  fen: string,
  allowedUcis: ReadonlySet<string>,
): Set<string> => {
  const position = createPosition(fen);
  if (!position || position.turn !== "black") return new Set();

  return new Set(
    legalMoves(position).flatMap((move) => {
      const uci = makeUci(move);
      if (!allowedUcis.has(uci)) return [];
      const next = createPosition(fen);
      if (!next) return [];
      next.play(move);
      const whiteKing = findPieceSquare(next, "white", "king");
      const blackKing = findPieceSquare(next, "black", "king");
      return whiteKing !== null && blackKing !== null && indexDistance(whiteKing, blackKing) <= 1
        ? [uci]
        : [];
    }),
  );
};

export const hasBlackPawn = (fen: string): boolean => {
  const position = createPosition(fen);
  return Boolean(position && findPieceSquare(position, "black", "pawn") !== null);
};

export const categoryLabel = (category: EndgameCategory): string => {
  if (category === "no-pawn") return "KQQ vs K";
  if (category === "a-pawn") return "a-pawn";
  if (category === "h-pawn") return "h-pawn";
  return `${category.slice(-1)}th rank`.replace("3th", "3rd");
};
