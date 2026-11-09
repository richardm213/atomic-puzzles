import type { Move } from "chessops";
import { makeFen, parseFen } from "chessops/fen";
import { makeUci } from "chessops/util";
import { Atomic } from "chessops/variant";

import { serializeSanLinesToPgn } from "../puzzles/solutionPgn";
import type { EndgameMode } from "./endgameModes";
export type { EndgameMode } from "./endgameModes";

export type PawnFileCategory = "rook-file" | "knight-file" | "regular-file";
export type PawnRankCategory = "rank-3" | "rank-regular" | "rank-7";
export type EndgameCategory = `${PawnFileCategory}:${PawnRankCategory}` | "no-pawn";

export const pawnFileCategories: PawnFileCategory[] = ["rook-file", "knight-file", "regular-file"];
export const pawnRankCategories: PawnRankCategory[] = ["rank-3", "rank-regular", "rank-7"];
export const pawnEndgameCategories: EndgameCategory[] = pawnFileCategories.flatMap((file) =>
  pawnRankCategories.map((rank): EndgameCategory => `${file}:${rank}`),
);

export type EndgamePosition = {
  fen: string;
  mode: EndgameMode;
  category: EndgameCategory;
  pawnSquare: string | null;
};

export const buildEndgamePgn = (fen: string, moves: string[] = []): string => {
  const moveText = moves.length ? serializeSanLinesToPgn(fen, [moves]) : "";
  return [
    '[Variant "Atomic"]',
    '[SetUp "1"]',
    `[FEN "${fen}"]`,
    "",
    moveText ? `${moveText} *` : "*",
  ].join("\n");
};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
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
  enemyRank: number,
): Array<{ whiteKing: string; blackKing: string }> => {
  const hasWhitePawn = mode === "pawn-duel" || mode === "rook-pawn-vs-pawn";
  const whitePawn = hasWhitePawn ? square(fileIndex, enemyRank - 1) : null;
  const blackPawn = square(fileIndex, enemyRank);
  const whiteCandidates = hasWhitePawn
    ? adjacentSquares(fileIndex, enemyRank - 1)
    : [{ fileIndex, rank: enemyRank - 1, name: square(fileIndex, enemyRank - 1) }];
  const blackCandidates = adjacentSquares(fileIndex, enemyRank);

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

const isRookAligned = (rook: string, king: string): boolean =>
  rook[0] === king[0] || rook[1] === king[1];

const isUsableFen = (fen: string): boolean => {
  const setup = parseFen(fen);
  if (setup.isErr) return false;
  const position = Atomic.fromSetup(setup.value);
  return position.isOk && !position.value.outcome();
};

const categoryRankAndFile = (
  category: EndgameCategory,
  random: () => number,
): { enemyRank: number; fileIndex: number } => {
  if (category === "no-pawn") return { enemyRank: 5, fileIndex: 3 };
  const [fileCategory, rankCategory] = category.split(":") as [PawnFileCategory, PawnRankCategory];
  const fileIndexes =
    fileCategory === "rook-file" ? [0, 7] : fileCategory === "knight-file" ? [1, 6] : [2, 3, 4, 5];
  const enemyRanks = rankCategory === "rank-3" ? [3] : rankCategory === "rank-7" ? [7] : [4, 5, 6];
  return {
    enemyRank: choice(enemyRanks, random),
    fileIndex: choice(fileIndexes, random),
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

type MaterialPiece = {
  symbol: string;
  allowedSquares?: readonly string[];
};

const pawnSquares = boardSquares.filter(
  (candidate) => candidate[1] !== "1" && candidate[1] !== "8",
);

const materialPiecesByMode: Partial<Record<EndgameMode, readonly MaterialPiece[]>> = {
  "rook-vs-pawn": [
    { symbol: "K" },
    { symbol: "R" },
    { symbol: "k" },
    { symbol: "p", allowedSquares: pawnSquares },
  ],
  "rook-bishop-vs-king": [{ symbol: "K" }, { symbol: "R" }, { symbol: "B" }, { symbol: "k" }],
  "rook-pawn-vs-king": [
    { symbol: "K" },
    { symbol: "R" },
    { symbol: "P", allowedSquares: pawnSquares },
    { symbol: "k" },
  ],
};

const generateMaterialPosition = (mode: EndgameMode, random: () => number): EndgamePosition => {
  const material = materialPiecesByMode[mode];
  if (!material) throw new Error(`Unsupported material endgame mode: ${mode}`);
  for (let attempt = 0; attempt < 8_000; attempt += 1) {
    const occupied = new Set<string>();
    const pieces = material.map((piece, pieceIndex) => {
      const candidates = piece.allowedSquares ?? boardSquares;
      let squareIndex =
        (Math.floor(random() * candidates.length) +
          attempt * (17 + pieceIndex * 2) +
          pieceIndex * 23) %
        candidates.length;
      while (occupied.has(candidates[squareIndex] as string)) {
        squareIndex = (squareIndex + 1) % candidates.length;
      }
      const pieceSquare = candidates[squareIndex] as string;
      occupied.add(pieceSquare);
      return { square: pieceSquare, symbol: piece.symbol };
    });
    if (mode === "rook-bishop-vs-king") {
      const pieceSquare = (symbol: string) =>
        pieces.find((piece) => piece.symbol === symbol)?.square ?? "";
      const whiteKing = pieceSquare("K");
      const blackKing = pieceSquare("k");
      const rook = pieceSquare("R");
      const bishop = pieceSquare("B");
      const whiteKingFile = files.indexOf(whiteKing[0] as (typeof files)[number]);
      const blackKingFile = files.indexOf(blackKing[0] as (typeof files)[number]);
      const rookFile = files.indexOf(rook[0] as (typeof files)[number]);
      const whiteKingRank = Number(whiteKing[1]);
      const blackKingRank = Number(blackKing[1]);
      const rookRank = Number(rook[1]);
      const rookCutsFiles =
        (whiteKingFile < rookFile && rookFile < blackKingFile) ||
        (blackKingFile < rookFile && rookFile < whiteKingFile);
      const rookCutsRanks =
        (whiteKingRank < rookRank && rookRank < blackKingRank) ||
        (blackKingRank < rookRank && rookRank < whiteKingRank);
      const bishopBlocksRook = bishop[0] === rook[0] || bishop[1] === rook[1];
      if (
        squareDistance(whiteKing, blackKing) < 4 ||
        squareDistance(rook, blackKing) < 2 ||
        bishopBlocksRook ||
        (!rookCutsFiles && !rookCutsRanks)
      ) {
        continue;
      }
    }
    const fen = buildFen(pieces);
    if (
      isUsableFen(fen) &&
      !hasImmediateWhiteWinFromFen(fen) &&
      (mode !== "rook-bishop-vs-king" || !hasForcedWhiteWinWithinTwo(fen)) &&
      hasSafeRookContinuation(fen)
    ) {
      const blackPawn = pieces.find((piece) => piece.symbol === "p");
      return {
        fen,
        mode,
        category: "no-pawn",
        pawnSquare: blackPawn?.square ?? null,
      };
    }
  }

  throw new Error(`Could not generate a legal ${mode} endgame position.`);
};

export const generateEndgamePosition = (
  mode: EndgameMode,
  category: EndgameCategory,
  random: () => number = Math.random,
): EndgamePosition => {
  if (mode === "two-queens") return generateTwoQueenPosition(random);
  if (materialPiecesByMode[mode]) return generateMaterialPosition(mode, random);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const { enemyRank, fileIndex } = categoryRankAndFile(category, random);
    const pawnSquare = square(fileIndex, enemyRank);
    const blackPawn = pawnSquare;
    const whitePawn =
      mode === "pawn-duel" || mode === "rook-pawn-vs-pawn"
        ? square(fileIndex, enemyRank - 1)
        : null;

    const kingPairs = connectedKingPairs(mode, fileIndex, enemyRank);
    const pairOffset = Math.floor(random() * kingPairs.length);
    for (let pairIndex = 0; pairIndex < kingPairs.length; pairIndex += 1) {
      const pair = kingPairs[(pairOffset + pairIndex) % kingPairs.length];
      if (!pair) continue;
      const { whiteKing, blackKing } = pair;
      const queenSquares = files.flatMap((file) =>
        Array.from({ length: 8 }, (_, index) => `${file}${index + 1}`),
      );
      const validMajorPieceSquares = queenSquares.filter(
        (candidate) =>
          ![whiteKing, blackKing, blackPawn, whitePawn].includes(candidate) &&
          squareDistance(candidate, whiteKing) >= 3 &&
          squareDistance(candidate, blackKing) >= 3 &&
          !(mode === "rook-pawn-vs-pawn"
            ? isRookAligned(candidate, blackKing)
            : isQueenAligned(candidate, blackKing)),
      );
      const safePositions = validMajorPieceSquares.flatMap((majorPieceSquare) => {
        const pieces = [
          { square: whiteKing, symbol: "K" },
          { square: majorPieceSquare, symbol: mode === "rook-pawn-vs-pawn" ? "R" : "Q" },
          { square: blackKing, symbol: "k" },
          { square: blackPawn, symbol: "p" },
          ...(whitePawn ? [{ square: whitePawn, symbol: "P" }] : []),
        ];
        const fen = buildFen(pieces);
        return isUsableFen(fen) &&
          !hasImmediateWhiteWinFromFen(fen) &&
          (mode !== "rook-pawn-vs-pawn" || hasSafeRookContinuation(fen))
          ? [fen]
          : [];
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
    const next = position.clone();
    next.play(move);
    return next.outcome()?.winner === "white";
  });
};

export const hasImmediateWhiteWinFromFen = (fen: string): boolean => {
  const position = createPosition(fen);
  return position ? hasImmediateWhiteWin(position) : false;
};

// Bounded, exact tactical screening for pawnless KRB positions. Unknown branches
// are retained: a small box alone is not proof that a position mates too soon.
export const hasForcedWhiteWinWithinTwo = (fen: string, maxNodes = 512): boolean => {
  const position = createPosition(fen);
  if (!position || position.turn !== "white" || position.board.pawn.nonEmpty()) return false;
  let nodes = 0;
  const forcedWin = (current: Atomic, plies: number): boolean | undefined => {
    if (++nodes > maxNodes) return undefined;
    const outcome = current.outcome();
    if (outcome) return outcome.winner === "white";
    if (plies === 0) return false;
    const moves = legalMoves(current);
    if (!moves.length) return false;
    let unknown = false;
    for (const move of moves) {
      const next = current.clone();
      next.play(move);
      const result = forcedWin(next, plies - 1);
      if (current.turn === "white" && result === true) return true;
      if (current.turn === "black" && result === false) return false;
      if (result === undefined) {
        unknown = true;
        if (nodes > maxNodes) return undefined;
      }
    }
    return unknown ? undefined : current.turn === "black";
  };
  return forcedWin(position, 3) === true;
};

// A rook alone cannot mate a bare king in atomic. Avoid spending engine time
// on setups where every first move lets Black win or remove all mating material.
export const hasSafeRookContinuation = (fen: string): boolean => {
  const position = createPosition(fen);
  if (!position || position.turn !== "white" || position.hasInsufficientMaterial("white"))
    return false;
  return legalMoves(position).some((move) => {
    const next = position.clone();
    next.play(move);
    if (next.outcome()) return next.outcome()?.winner === "white";
    if (next.hasInsufficientMaterial("white")) return false;
    return !legalMoves(next).some((reply) => {
      const defended = next.clone();
      defended.play(reply);
      const outcome = defended.outcome();
      return (
        defended.hasInsufficientMaterial("white") ||
        (outcome !== undefined && outcome.winner !== "white")
      );
    });
  });
};

export const defenderReplyFens = (fen: string): string[] => {
  const position = createPosition(fen);
  if (!position || position.turn !== "white") return [];

  return legalMoves(position).flatMap((move) => {
    const next = createPosition(fen);
    if (!next) return [];
    next.play(move);
    return next.turn === "black" && !next.outcome() ? [makeFen(next.toSetup())] : [];
  });
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
  const [file, rank] = category.split(":") as [PawnFileCategory, PawnRankCategory];
  const fileLabel =
    file === "rook-file" ? "Rook pawn" : file === "knight-file" ? "Knight pawn" : "Regular pawn";
  const rankLabel =
    rank === "rank-3" ? "3rd rank" : rank === "rank-7" ? "7th rank" : "Regular rank";
  return `${fileLabel} · ${rankLabel}`;
};
