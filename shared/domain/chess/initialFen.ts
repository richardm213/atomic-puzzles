import { INITIAL_FEN, makeFen } from "chessops/fen";

import { createAtomicPosition, moveFromUci } from "./pgn";

const FILE_NAMES = "abcdefgh";
const PAWN_RANKS = "/pppppppp/8/8/8/8/PPPPPPPP/";

const atomic960StartingFens = (): string[] => {
  const fens: string[] = [];

  for (const lightBishop of [0, 2, 4, 6]) {
    for (const darkBishop of [1, 3, 5, 7]) {
      for (let queen = 0; queen < 8; queen += 1) {
        if (queen === lightBishop || queen === darkBishop) continue;

        const afterQueen = Array.from({ length: 8 }, (_, file) => file).filter(
          (file) => file !== lightBishop && file !== darkBishop && file !== queen,
        );

        for (
          let firstKnightIndex = 0;
          firstKnightIndex < afterQueen.length - 1;
          firstKnightIndex += 1
        ) {
          for (
            let secondKnightIndex = firstKnightIndex + 1;
            secondKnightIndex < afterQueen.length;
            secondKnightIndex += 1
          ) {
            const firstKnight = afterQueen[firstKnightIndex]!;
            const secondKnight = afterQueen[secondKnightIndex]!;
            const rookKingRook = afterQueen.filter(
              (file) => file !== firstKnight && file !== secondKnight,
            );
            const queenSideRook = rookKingRook[0]!;
            const king = rookKingRook[1]!;
            const kingSideRook = rookKingRook[2]!;
            const backRank = Array<string>(8);
            backRank[lightBishop] = "b";
            backRank[darkBishop] = "b";
            backRank[queen] = "q";
            backRank[firstKnight] = "n";
            backRank[secondKnight] = "n";
            backRank[queenSideRook] = "r";
            backRank[king] = "k";
            backRank[kingSideRook] = "r";

            const blackBackRank = backRank.join("");
            const castlingFiles = `${FILE_NAMES[queenSideRook]}${FILE_NAMES[kingSideRook]}`;
            fens.push(
              `${blackBackRank}${PAWN_RANKS}${blackBackRank.toUpperCase()} w ${castlingFiles.toUpperCase()}${castlingFiles} - 0 1`,
            );
          }
        }
      }
    }
  }

  return fens;
};

const ATOMIC_960_STARTING_FENS = atomic960StartingFens();

const playsCompleteLine = (fen: string, moves: readonly string[]): boolean => {
  try {
    const position = createAtomicPosition(fen);
    for (const uci of moves) {
      const move = moveFromUci(position, uci);
      if (!move) return false;
      position.play(move);
    }
    // Normalize once so malformed setups cannot accidentally pass through.
    makeFen(position.toSetup());
    return true;
  } catch {
    return false;
  }
};

/**
 * Older Atomic960 archive rows do not include their starting FEN. Recover it
 * only when the complete move list identifies exactly one legal Chess960
 * setup; returning a guess would make the replay silently wrong.
 */
export const inferAtomic960InitialFen = (
  moves: readonly string[] | null | undefined,
): string | null => {
  if (!moves?.length) return null;

  let match: string | null = null;
  for (const fen of ATOMIC_960_STARTING_FENS) {
    if (!playsCompleteLine(fen, moves)) continue;
    if (match) return null;
    match = fen;
  }
  return match;
};

// Use the same game root for the board, analysis and saved puzzle positions.
export const archivedGameInitialFen = (game: {
  initial_fen?: string | null | undefined;
  mode?: string | undefined;
  moves?: readonly string[] | null | undefined;
}): string | null =>
  game.initial_fen?.trim() ||
  (game.mode === "atomic960" ? inferAtomic960InitialFen(game.moves) : INITIAL_FEN);
