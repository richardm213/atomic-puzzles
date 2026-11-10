import { normalizeMove } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { makeUci } from "chessops/util";

import { createAtomicPosition, moveFromUci } from "./chess/pgn";
import {
  GAME_ANALYSIS_VARIATION_SIZE as SIZE,
  type StoredAtomicDbCandidate,
  type StoredAtomicDbPosition,
} from "./gameAnalysis";

export type SupplementalEngineLine = {
  pv: string[];
  cp: number | null;
  mate: number | null;
  depth: number | null;
};
export type SearchSupplementalEngine = (
  fen: string,
  lines: number,
  rootMoves?: string[],
) => Promise<SupplementalEngineLine[]>;

type Board = ReturnType<typeof createAtomicPosition>;
const legalUci = (board: Board): string[] => {
  const moves: string[] = [];
  for (const [from, destinations] of board.allDests()) {
    for (const to of destinations) {
      if (board.board.getRole(from) === "pawn" && (to < 8 || to >= 56)) {
        for (const promotion of ["queen", "rook", "bishop", "knight"] as const) {
          moves.push(makeUci({ from, to, promotion }));
        }
      } else {
        moves.push(makeUci({ from, to }));
      }
    }
  }
  return moves;
};
const trace = (board: Board, uci: readonly string[], limit = SIZE) => {
  const pv: string[] = [];
  for (const token of uci.slice(0, limit)) {
    if (board.outcome()) break;
    const move = moveFromUci(board, token);
    if (!move) break;
    board.play(move);
    pv.push(token);
  }
  return pv;
};
const needsContinuation = (board: Board, line: StoredAtomicDbCandidate) => {
  const end = board.clone();
  const length = trace(end, line.pv).length;
  return length < SIZE && !end.outcome();
};
const comparableMove = (board: Board, uci: string) => {
  const move = moveFromUci(board, uci);
  return move ? makeUci(normalizeMove(board, move)) : null;
};
const usableCandidates = (board: Board, entries: readonly StoredAtomicDbCandidate[]) => {
  const seen = new Set<string>();
  return entries
    .flatMap((candidate) => {
      const root = comparableMove(board, candidate.move);
      if (!root || seen.has(root) || candidate.pv[0] !== candidate.move) return [];
      seen.add(root);
      const pv = trace(board.clone(), candidate.pv);
      return [{ ...candidate, pv }];
    })
    .slice(0, SIZE);
};
const getBoard = (position: StoredAtomicDbPosition): Board | null => {
  if (position.status === "SKIPPED" || position.closure === "TERMINAL") return null;
  try {
    const board = createAtomicPosition(position.fen);
    return board.outcome() ? null : board;
  } catch {
    return null;
  }
};

export const gameAnalysisVariationGaps = (position: StoredAtomicDbPosition): boolean => {
  const board = getBoard(position);
  if (!board) return false;
  const candidates = usableCandidates(board, position.candidates ?? []);
  return (
    candidates.length !== Math.min(SIZE, legalUci(board).length) ||
    candidates.some((line) => needsContinuation(board, line))
  );
};

export const mergeOpeningVariationSupplement = (
  position: StoredAtomicDbPosition,
  supplemental: readonly StoredAtomicDbCandidate[] | null,
): StoredAtomicDbPosition => {
  if (!supplemental?.length) return position;
  const board = getBoard(position);
  if (!board) return position;
  const candidates = usableCandidates(board, position.candidates ?? []);
  const fills = usableCandidates(board, supplemental);
  const filled = candidates.map((base) => {
    if (!needsContinuation(board, base)) return base;
    const replacement = fills.find(
      (fill) =>
        comparableMove(board, fill.move) === comparableMove(board, base.move) &&
        !needsContinuation(board, fill),
    );
    return replacement
      ? {
          ...base,
          pv: [base.move, ...replacement.pv.slice(1)],
          variationSource: "atomic-stockfish" as const,
        }
      : base;
  });
  for (const fill of fills) {
    if (filled.length === SIZE) break;
    if (
      !filled.some((base) => comparableMove(board, base.move) === comparableMove(board, fill.move))
    ) {
      filled.push(fill);
    }
  }
  return { ...position, candidates: filled };
};

export const completeGameAnalysisVariations = async (
  position: StoredAtomicDbPosition,
  search: SearchSupplementalEngine,
): Promise<StoredAtomicDbPosition> => {
  const root = getBoard(position);
  if (!root || !gameAnalysisVariationGaps(position)) return position;
  const candidates = usableCandidates(root, position.candidates ?? []);
  const used = new Set(candidates.map(({ move }) => comparableMove(root, move)));
  const available = legalUci(root).filter((move) => !used.has(comparableMove(root, move)));
  const missing = Math.min(SIZE - candidates.length, available.length);
  const addEngineLine = ({ pv, cp, mate, depth }: SupplementalEngineLine) => {
    const move = pv[0];
    if (!move) return;
    const key = comparableMove(root, move);
    if (!key || used.has(key)) return;
    used.add(key);
    candidates.push({
      move,
      status: "UNKNOWN",
      closure: null,
      score: cp,
      point: null,
      mate,
      depth,
      origin: "atomic-stockfish",
      variationSource: "atomic-stockfish",
      pv,
    });
  };
  if (missing > 0) {
    for (const line of await search(position.fen, missing, available)) {
      if (candidates.length < SIZE) addEngineLine(line);
    }
    // A shallow MultiPV iteration may not return every slot before its node limit.
    for (const move of available) {
      if (candidates.length === SIZE) break;
      if (used.has(comparableMove(root, move))) continue;
      const [line] = await search(position.fen, 1, [move]);
      if (line) addEngineLine(line);
    }
  }
  const filled: StoredAtomicDbCandidate[] = [];
  for (const line of candidates) {
    const board = root.clone();
    const pv = trace(board, line.pv);
    while (pv.length < SIZE && !board.outcome()) {
      const [continuation] = await search(makeFen(board.toSetup()), 1);
      const extension = continuation ? trace(board, continuation.pv, SIZE - pv.length) : [];
      if (!extension.length) break;
      pv.push(...extension);
    }
    filled.push({
      ...line,
      pv,
      ...(pv.length > line.pv.length ? { variationSource: "atomic-stockfish" as const } : {}),
    });
  }
  const result = { ...position, variationPlies: SIZE, candidates: filled };
  if (gameAnalysisVariationGaps(result))
    throw new Error(`The engine could not complete ${position.fen}.`);
  return result;
};
