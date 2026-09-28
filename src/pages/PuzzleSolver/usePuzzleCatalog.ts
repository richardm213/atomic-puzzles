import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadPuzzleCatalog,
  loadPuzzlesById,
  loadPuzzleSolverIndex,
  type Puzzle,
} from "../../lib/puzzles/puzzleLibrary";

const parsePuzzleId = (value: string): number | null => {
  const puzzleId = Number.parseInt(value, 10);
  return Number.isNaN(puzzleId) ? null : puzzleId;
};

export const usePuzzleCatalog = (routePuzzleId: string, routeSetKey: string) => {
  const initialRoutePuzzleIdRef = useRef(parsePuzzleId(routePuzzleId));
  const initialRouteSetKeyRef = useRef(routeSetKey);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loadingError, setLoadingError] = useState("");

  const mergeLoadedPuzzles = useCallback((loadedPuzzles: Puzzle[]): void => {
    if (!loadedPuzzles.length) return;
    const loadedById = new Map(
      loadedPuzzles.map((puzzle) => [String(puzzle.puzzleId), puzzle] as const),
    );
    setPuzzles((current) =>
      current.map((puzzle) => loadedById.get(String(puzzle.puzzleId)) ?? puzzle),
    );
  }, []);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        setLoadingError("");
        const initialPuzzleId = initialRoutePuzzleIdRef.current;
        const [catalog, initialPuzzles] = await Promise.all([
          initialRouteSetKeyRef.current ? loadPuzzleCatalog() : loadPuzzleSolverIndex(),
          initialPuzzleId === null ? Promise.resolve([]) : loadPuzzlesById([initialPuzzleId]),
        ]);
        if (!active) return;

        const initialPuzzlesById = new Map(
          initialPuzzles.map((puzzle) => [String(puzzle.puzzleId), puzzle] as const),
        );
        setPuzzles(
          catalog.map((puzzle) => initialPuzzlesById.get(String(puzzle.puzzleId)) ?? puzzle),
        );
      } catch (error) {
        if (!active) return;
        setPuzzles([]);
        setLoadingError(error instanceof Error ? error.message : "Failed to load puzzles");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  return { puzzles, setPuzzles, loadingError, setLoadingError, mergeLoadedPuzzles };
};
