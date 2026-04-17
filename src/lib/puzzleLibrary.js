import { fetchPuzzleRowsFromSupabase } from "./supabasePuzzles";
import { normalizeSolutionPgn } from "./solutionPgn";

const solutionFieldCandidates = ["solution", "moves", "line", "pgn", "variation"];

const normalizeSolution = (rawValue) => {
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

const extractSolutionFromRow = (row) => {
  for (const fieldName of solutionFieldCandidates) {
    const normalized = normalizeSolution(row?.[fieldName]);
    if (normalized) return normalized;
  }

  return "";
};

const hasSolution = (puzzle) => {
  if (!puzzle) return false;
  return puzzle.solution.length > 0;
};

const normalizePuzzleRow = (item, index) => {
  const parsedId = Number.parseInt(item?.id, 10);

  return {
    ...item,
    fen: typeof item?.fen === "string" ? item.fen.trim() : "",
    solution: normalizeSolutionPgn(
      typeof item?.fen === "string" ? item.fen.trim() : "",
      extractSolutionFromRow(item),
    ),
    puzzleId: parsedId || index + 1,
  };
};

export const loadPuzzleLibrary = async () =>
  (await fetchPuzzleRowsFromSupabase())
    .map(normalizePuzzleRow)
    .filter((item) => item.fen.length > 0 && hasSolution(item));
