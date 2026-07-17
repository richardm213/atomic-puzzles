import type { PuzzleSolutionField } from "../../types/puzzles";
import {
  fetchPuzzleCatalogFromSupabase,
  fetchPuzzleRowsByIdFromSupabase,
  type PuzzleRow,
} from "../supabase/supabasePuzzles";
import { normalizeSolutionPgn, parseSolutionUciLines } from "./solutionPgn";

export type Puzzle = PuzzleRow & {
  fen: string;
  solution: string;
  explanation: string;
  puzzleId: number;
};

const solutionFieldCandidates: PuzzleSolutionField[] = [
  "solution",
  "moves",
  "line",
  "pgn",
  "variation",
];

const normalizeSolution = (rawValue: unknown): string => {
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : "";
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
      .join(" ");
  }

  return "";
};

const extractSolutionFromRow = (row: PuzzleRow): string => {
  for (const fieldName of solutionFieldCandidates) {
    const normalized = normalizeSolution(row?.[fieldName]);
    if (normalized) return normalized;
  }

  return "";
};

const hasPlayableSolution = (puzzle: Puzzle): boolean =>
  Boolean(puzzle?.fen && parseSolutionUciLines(puzzle.fen, puzzle.solution).length > 0);

const normalizePuzzleRow = (item: PuzzleRow, index: number): Puzzle => {
  const parsedId = Number.parseInt(String(item?.["id"] ?? ""), 10);
  const fen = typeof item?.["fen"] === "string" ? (item["fen"] as string).trim() : "";
  const explanation =
    typeof item?.["explanation"] === "string" ? (item["explanation"] as string).trim() : "";

  return {
    ...item,
    fen,
    explanation,
    solution: normalizeSolutionPgn(fen, extractSolutionFromRow(item)),
    puzzleId: parsedId || index + 1,
  };
};

const normalizePuzzleCatalogRow = (item: PuzzleRow, index: number): Puzzle => {
  const parsedId = Number.parseInt(String(item?.["id"] ?? ""), 10);

  return {
    ...item,
    fen: "",
    solution: "",
    explanation: "",
    puzzleId: parsedId || index + 1,
  };
};

export const loadPuzzleCatalog = async (): Promise<Puzzle[]> =>
  (await fetchPuzzleCatalogFromSupabase()).map(normalizePuzzleCatalogRow);

export const loadPuzzlesById = async (puzzleIds: Array<number | string>): Promise<Puzzle[]> => {
  const requestedIds = puzzleIds.map(String);
  const puzzles = (await fetchPuzzleRowsByIdFromSupabase(puzzleIds))
    .map(normalizePuzzleRow)
    .filter((item) => item.fen.length > 0 && hasPlayableSolution(item));

  const puzzlesById = new Map(puzzles.map((puzzle) => [String(puzzle.puzzleId), puzzle]));
  return requestedIds.flatMap((puzzleId) => {
    const puzzle = puzzlesById.get(puzzleId);
    return puzzle ? [puzzle] : [];
  });
};
