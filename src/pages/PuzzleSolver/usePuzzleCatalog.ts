import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadPuzzleCatalog,
  loadPuzzlesById,
  loadPuzzleSolverIndex,
  type Puzzle,
} from "../../lib/puzzles/puzzleLibrary";
import { getErrorMessage } from "../../utils/errors";

export const parsePuzzleId = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const puzzleId = Number.parseInt(value, 10);
  return Number.isNaN(puzzleId) ? null : puzzleId;
};

const puzzlePlaceholder = (id: number): Puzzle => ({
  id,
  puzzleId: id,
  fen: "",
  solution: "",
  explanation: "",
  tags: [],
});

// Preserve indexes used by navigation history, and never replace playable details with index rows.
const mergePuzzles = (current: Puzzle[], incoming: Puzzle[]): Puzzle[] => {
  const byId = new Map(current.map((puzzle) => [puzzle.puzzleId, puzzle]));
  for (const puzzle of incoming) {
    const previous = byId.get(puzzle.puzzleId);
    byId.set(puzzle.puzzleId, previous?.fen && !puzzle.fen ? { ...puzzle, ...previous } : puzzle);
  }
  return [...byId.values()];
};

export const usePuzzleCatalog = (
  routePuzzleId: string,
  routeSetKey: string,
  loadDetails = loadPuzzlesById,
) => {
  const puzzleId = parsePuzzleId(routePuzzleId);
  const fullCatalog = Boolean(routeSetKey);
  const [puzzles, setPuzzles] = useState<Puzzle[]>(() =>
    puzzleId === null ? [] : [puzzlePlaceholder(puzzleId)],
  );
  const [loadingError, setLoadingError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [unavailablePuzzleIds, setUnavailablePuzzleIds] = useState<Set<string>>(() => new Set());
  const requests = useRef(new Map<string, Promise<Puzzle | undefined>>());
  const mounted = useRef(true);

  // A direct link always selects its own placeholder, even before the index knows the ID.
  if (puzzleId !== null && !puzzles.some((puzzle) => puzzle.puzzleId === puzzleId)) {
    setPuzzles((current) => [...current, puzzlePlaceholder(puzzleId)]);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mergeLoadedPuzzles = useCallback((loaded: Puzzle[]) => {
    if (mounted.current && loaded.length) setPuzzles((current) => mergePuzzles(current, loaded));
  }, []);

  const loadPuzzleDetails = useCallback(
    (ids: Array<number | string>, activePuzzleId: number | string | null = null) => {
      const uniqueIds = [...new Set(ids.map(String))];
      const missing = uniqueIds.filter((id) => !requests.current.has(id));
      if (missing.length) {
        const batch = loadDetails(missing.map(Number), {
          activePuzzleId:
            activePuzzleId !== null && missing.includes(String(activePuzzleId))
              ? activePuzzleId
              : null,
        }).then((loaded) => {
          mergeLoadedPuzzles(loaded);
          if (mounted.current) {
            const loadedIds = new Set(loaded.map((puzzle) => String(puzzle.puzzleId)));
            const unavailable = missing.filter((id) => !loadedIds.has(id));
            if (unavailable.length)
              setUnavailablePuzzleIds((current) => new Set([...current, ...unavailable]));
          }
          return loaded;
        });
        for (const id of missing) {
          const request = batch
            .then((loaded) => loaded.find((puzzle) => String(puzzle.puzzleId) === id))
            .catch((error: unknown) => {
              requests.current.delete(id);
              throw error;
            });
          requests.current.set(id, request);
        }
      }
      return Promise.all(uniqueIds.map((id) => requests.current.get(id)!)).then((loaded) =>
        loaded.filter((puzzle): puzzle is Puzzle => puzzle !== undefined),
      );
    },
    [loadDetails, mergeLoadedPuzzles],
  );

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    void (fullCatalog ? loadPuzzleCatalog() : loadPuzzleSolverIndex())
      .then((catalog) => {
        if (active) mergeLoadedPuzzles(catalog);
      })
      .catch((error: unknown) => {
        if (active) setLoadingError(getErrorMessage(error, "Failed to load puzzles"));
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fullCatalog, mergeLoadedPuzzles]);

  return {
    puzzles,
    setPuzzles,
    loadingError,
    catalogLoading,
    setLoadingError,
    loadPuzzleDetails,
    unavailablePuzzleIds,
  };
};
