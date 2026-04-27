import { fetchPuzzleRowsFromSupabase, type PuzzleRow } from "../supabase/supabasePuzzles";
import { normalizeSolutionPgn, parseSolutionUciLines } from "./solutionPgn";

export type Puzzle = PuzzleRow & {
  fen: string;
  solution: string;
  puzzleId: number;
};

const solutionFieldCandidates = ["solution", "moves", "line", "pgn", "variation"];

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

  return {
    ...item,
    fen,
    solution: normalizeSolutionPgn(fen, extractSolutionFromRow(item)),
    puzzleId: parsedId || index + 1,
  };
};

export const loadPuzzleLibrary = async (): Promise<Puzzle[]> =>
  (await fetchPuzzleRowsFromSupabase())
    .map(normalizePuzzleRow)
    .filter((item) => item.fen.length > 0 && hasPlayableSolution(item));
