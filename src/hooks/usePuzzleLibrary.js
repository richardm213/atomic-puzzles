import { useEffect, useState } from "react";
import { fetchPuzzleRowsFromSupabase, getSupabasePuzzlesTableName } from "../lib/supabasePuzzles";

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
  if (typeof puzzle.solution === "string") return puzzle.solution.trim().length > 0;
  return Array.isArray(puzzle.solution) && puzzle.solution.length > 0;
};

export const usePuzzleLibrary = () => {
  const [puzzles, setPuzzles] = useState([]);
  const [loadingError, setLoadingError] = useState("");

  useEffect(() => {
    let ignore = false;

    const loadPuzzles = async () => {
      try {
        setLoadingError("");
        const data = await fetchPuzzleRowsFromSupabase();
        const puzzleTable = getSupabasePuzzlesTableName();

        const normalizedPuzzles = data.map((item, index) => {
          const rawId = item?.id;
          const parsedId = Number.parseInt(rawId, 10);
          const puzzleId = parsedId || index + 1;
          const fen = typeof item?.fen === "string" ? item.fen.trim() : "";
          const solution = extractSolutionFromRow(item);

          return {
            ...item,
            fen,
            solution,
            puzzleId,
          };
        });

        const availablePuzzles = normalizedPuzzles.filter(
          (item) => typeof item?.fen === "string" && item.fen.length > 0 && hasSolution(item),
        );

        if (data.length === 0) {
          throw new Error(
            `Supabase returned 0 rows from table "${puzzleTable}". Check table name and RLS SELECT policy for the anon role.`,
          );
        }

        if (availablePuzzles.length === 0) {
          throw new Error(
            `No puzzles found in "${puzzleTable}" with both a valid fen and a solution`,
          );
        }

        if (!ignore) {
          setPuzzles(availablePuzzles);
        }
      } catch (error) {
        if (!ignore) {
          setPuzzles([]);
          setLoadingError(error.message || "Failed to load puzzles");
        }
      }
    };

    loadPuzzles();

    return () => {
      ignore = true;
    };
  }, []);

  return {
    puzzles,
    loadingError,
  };
};
