import { useEffect, useState } from "react";
import { fetchPuzzleRowsFromSupabase } from "../lib/supabasePuzzles";

const solutionFieldCandidates = ["solution", "moves", "line", "pgn", "variation"];
const emptyPuzzles = [];

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
  if (typeof puzzle.solution === "string") return puzzle.solution.trim().length > 0;
  return Array.isArray(puzzle.solution) && puzzle.solution.length > 0;
};

const normalizePuzzleRow = (item, index) => {
  const parsedId = Number.parseInt(item?.id, 10);

  return {
    ...item,
    fen: typeof item?.fen === "string" ? item.fen.trim() : "",
    solution: extractSolutionFromRow(item),
    puzzleId: parsedId || index + 1,
  };
};

export const usePuzzleLibrary = () => {
  const [puzzles, setPuzzles] = useState(emptyPuzzles);
  const [loadingError, setLoadingError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    const loadPuzzles = async () => {
      try {
        setLoadingError("");
        const data = await fetchPuzzleRowsFromSupabase();
        const availablePuzzles = data
          .map(normalizePuzzleRow)
          .filter((item) => item.fen.length > 0 && hasSolution(item));

        if (isCurrent) setPuzzles(availablePuzzles);
      } catch (error) {
        if (!isCurrent) return;
        setPuzzles(emptyPuzzles);
        setLoadingError(error.message || "Failed to load puzzles");
      }
    };

    loadPuzzles();

    return () => {
      isCurrent = false;
    };
  }, []);

  return {
    puzzles,
    loadingError,
  };
};
