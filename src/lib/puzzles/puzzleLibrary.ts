import type { PuzzleSolutionField } from "../../types/puzzles";
import {
  fetchPuzzleCatalogFromSupabase,
  fetchPuzzleSolverIndexFromSupabase,
  type PuzzleRow,
} from "../supabase/puzzles";
import { normalizePuzzleMotifTags } from "./puzzleMotifs";
import { fetchPuzzleDetails } from "./puzzlePlay";
import { normalizeSolutionPgn } from "./solutionPgn";

export type Puzzle = PuzzleRow & {
  fen: string;
  solution: string;
  explanation: string;
  tags: string[];
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

const normalizePuzzleRow = (item: PuzzleRow, index: number): Puzzle => {
  const parsedId = Number.parseInt(String(item?.["id"] ?? ""), 10);
  const fen = typeof item?.["fen"] === "string" ? item["fen"].trim() : "";
  const explanation = typeof item?.["explanation"] === "string" ? item["explanation"].trim() : "";

  return {
    ...item,
    fen,
    explanation,
    tags: normalizePuzzleMotifTags(item?.["tags"]),
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
    tags: normalizePuzzleMotifTags(item?.["tags"]),
    puzzleId: parsedId || index + 1,
  };
};

export const loadPuzzleCatalog = async (): Promise<Puzzle[]> =>
  (await fetchPuzzleCatalogFromSupabase()).map(normalizePuzzleCatalogRow);

export const loadPuzzleSolverIndex = async (): Promise<Puzzle[]> =>
  (await fetchPuzzleSolverIndexFromSupabase()).map(normalizePuzzleCatalogRow);

export const loadPuzzlesById = async (puzzleIds: Array<number | string>): Promise<Puzzle[]> => {
  const requestedIds = puzzleIds.map(String);
  const rows = await fetchPuzzleDetails(puzzleIds);
  const puzzles = rows.map(normalizePuzzleRow).filter((item) => item.fen.length > 0);

  const puzzlesById = new Map(puzzles.map((puzzle) => [String(puzzle.puzzleId), puzzle]));
  return requestedIds.flatMap((puzzleId) => {
    const puzzle = puzzlesById.get(puzzleId);
    return puzzle ? [puzzle] : [];
  });
};
