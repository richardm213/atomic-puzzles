import type { Puzzle } from "../../lib/puzzles/puzzleLibrary";
import { type ChessboardState, initialBoardView } from "../../types/chessboard";
import { getBrowserStorageItem, setBrowserStorageItem } from "../../utils/browserStorage";
import { parsePuzzleId } from "./usePuzzleCatalog";

const PUZZLE_ATTEMPT_STORAGE_DURATION_MS = 30 * 60 * 1_000;
const PUZZLE_ATTEMPT_STARTED_AT_STORAGE_PREFIX = "atomic-puzzles.puzzle-attempt-started-at.v1";

export const toPuzzleKey = (puzzleId: unknown): string =>
  puzzleId === undefined || puzzleId === null ? "" : String(puzzleId).trim();

export const getPuzzleAttemptStartedAt = (puzzleId: string): number => {
  const storageKey = `${PUZZLE_ATTEMPT_STARTED_AT_STORAGE_PREFIX}:${puzzleId}`;
  const now = Date.now();
  const storedStartedAt = Number.parseInt(getBrowserStorageItem("local", storageKey) ?? "", 10);
  const storedAttemptAge = now - storedStartedAt;

  if (
    Number.isFinite(storedStartedAt) &&
    storedAttemptAge >= 0 &&
    storedAttemptAge <= PUZZLE_ATTEMPT_STORAGE_DURATION_MS
  ) {
    return storedStartedAt;
  }

  setBrowserStorageItem("local", storageKey, String(now));
  return now;
};

// An existing attempt keeps its wall-clock start across visits, but not replay time.
export const excludePuzzleIntroTime = (puzzleId: string, durationMs: number): void => {
  if (!puzzleId || durationMs <= 0) return;
  const storageKey = `${PUZZLE_ATTEMPT_STARTED_AT_STORAGE_PREFIX}:${puzzleId}`;
  const startedAt = Number.parseInt(getBrowserStorageItem("local", storageKey) ?? "", 10);
  const now = Date.now();
  const ageBeforeIntro = now - durationMs - startedAt;
  if (ageBeforeIntro >= 0 && ageBeforeIntro <= PUZZLE_ATTEMPT_STORAGE_DURATION_MS) {
    setBrowserStorageItem("local", storageKey, String(startedAt + durationMs));
  }
};

export const addValueToSet = (currentSet: Set<string>, value: string): Set<string> => {
  if (!value) return currentSet;
  const next = new Set(currentSet);
  next.add(value);
  return next;
};

export const removeValueFromSet = (currentSet: Set<string>, value: string): Set<string> => {
  if (!value || !currentSet.has(value)) return currentSet;
  const next = new Set(currentSet);
  next.delete(value);
  return next;
};

export const puzzleIndexFromParam = (
  puzzles: Puzzle[],
  puzzleIdParam: string | null | undefined,
): number => {
  const puzzleId = parsePuzzleId(puzzleIdParam);
  return puzzleId === null ? -1 : puzzles.findIndex((puzzle) => puzzle.puzzleId === puzzleId);
};

const randomInt = (max: number): number => {
  if (!Number.isInteger(max) || max <= 0) return 0;
  if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * max);

  const maxUint32 = 0x1_0000_0000;
  const limit = maxUint32 - (maxUint32 % max);
  const values = new Uint32Array(1);
  do {
    window.crypto.getRandomValues(values);
  } while ((values[0] ?? 0) >= limit);
  return (values[0] ?? 0) % max;
};

export const shuffleIndexes = (indexes: number[]): number[] => {
  const shuffled = [...indexes];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
};

export const createInitialBoardState = (): ChessboardState => ({
  fen: "",
  turn: "",
  status: "Loading puzzles...",
  error: "",
  lineMoves: [],
  solutionLines: [],
  view: initialBoardView(),
  solved: false,
});

export const createInitialBoardSnapshot = () => ({
  fen: "",
  view: initialBoardView(),
});
