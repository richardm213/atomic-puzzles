import { useEffect, useMemo, useState } from "react";
import { Chessboard } from "./Chessboard";

const OPENING_SOLUTION_COUNT = 5;

const lichessAnalysisUrl = (fen) => {
  if (!fen) return "https://lichess.org/analysis";
  return `https://lichess.org/analysis/${fen.replaceAll(" ", "_")}`;
};

const orientationFromFen = (fen) => {
  const turn = fen?.split(" ")?.[1];
  return turn === "b" ? "black" : "white";
};

const puzzleIndexFromPath = (count) => {
  const match = window.location.pathname.match(/^\/(\d+)\/?$/);
  if (!match) return -1;

  const puzzleNumber = Number.parseInt(match[1], 10);
  if (Number.isNaN(puzzleNumber)) return -1;

  const puzzleIndex = puzzleNumber - 1;
  if (puzzleIndex < 0 || puzzleIndex >= count) return -1;
  return puzzleIndex;
};

const replaceUrlWithPuzzle = (puzzleIndex) => {
  const nextPath = `/${puzzleIndex + 1}`;
  if (window.location.pathname !== nextPath) {
    window.history.replaceState(null, "", nextPath);
  }
};

const hasSolution = (puzzle) => {
  if (!puzzle) return false;
  if (typeof puzzle.solution === "string")
    return puzzle.solution.trim().length > 0;
  return Array.isArray(puzzle.solution) && puzzle.solution.length > 0;
};

const shuffle = (items) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

export const App = () => {
  const [puzzles, setPuzzles] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loadingError, setLoadingError] = useState("");
  const [remainingOpeningPuzzleIndexes, setRemainingOpeningPuzzleIndexes] =
    useState([]);
  const [boardState, setBoardState] = useState({
    fen: "",
    turn: "",
    status: "Loading puzzles...",
    winner: undefined,
    error: "",
    line: "",
    lineIndex: 0,
    showWrongMove: false,
    solved: false,
  });

  useEffect(() => {
    let cancelled = false;

    const loadPuzzles = async () => {
      try {
        setLoadingError("");
        const response = await fetch("/private/puzzles.json");
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} while loading /private/puzzles.json`,
          );
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error(
            "Expected /private/puzzles.json to contain an array of puzzles",
          );
        }

        const availablePuzzles = data.filter(
          (item) => typeof item?.fen === "string" && item.fen.length > 0,
        );

        if (availablePuzzles.length === 0) {
          throw new Error("No puzzles found with a valid fen");
        }

        const solutionPuzzles = availablePuzzles.filter((puzzle) =>
          hasSolution(puzzle),
        );

        const shuffledSolutions = shuffle(solutionPuzzles);
        const openingSolutionPuzzles = shuffledSolutions.slice(
          0,
          OPENING_SOLUTION_COUNT,
        );

        const prioritizedPuzzles = [
          ...openingSolutionPuzzles,
          ...availablePuzzles.filter(
            (puzzle) => !openingSolutionPuzzles.includes(puzzle),
          ),
        ];

        if (!cancelled) {
          const firstIndexFromPath = puzzleIndexFromPath(
            prioritizedPuzzles.length,
          );
          const openingIndexes = openingSolutionPuzzles.map(
            (_, index) => index,
          );
          const preferredInitialIndex =
            openingIndexes.length > 0
              ? openingIndexes[
                  Math.floor(Math.random() * openingIndexes.length)
                ]
              : Math.floor(Math.random() * prioritizedPuzzles.length);
          const firstIndex =
            firstIndexFromPath >= 0
              ? firstIndexFromPath
              : preferredInitialIndex;

          const remainingOpening = openingIndexes.filter(
            (index) => index !== firstIndex,
          );

          setPuzzles(prioritizedPuzzles);
          setHistory([firstIndex]);
          setHistoryIndex(0);
          setRemainingOpeningPuzzleIndexes(remainingOpening);
          replaceUrlWithPuzzle(firstIndex);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadingError(error.message || "Failed to load puzzles");
          setBoardState((prev) => ({
            ...prev,
            status: "Puzzle load error",
            error: error.message || "Failed to load puzzles",
          }));
        }
      }
    };

    loadPuzzles();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (puzzles.length === 0) return;

    const onPopState = () => {
      const selectedIndex = puzzleIndexFromPath(puzzles.length);
      if (selectedIndex < 0) return;

      setHistory([selectedIndex]);
      setHistoryIndex(0);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [puzzles]);

  const activePuzzleIndex = historyIndex >= 0 ? history[historyIndex] : -1;
  const activePuzzle =
    activePuzzleIndex >= 0 ? puzzles[activePuzzleIndex] : null;
  const fen = activePuzzle?.fen ?? "";
  const orientation = orientationFromFen(fen);
  const analysisUrl = useMemo(() => lichessAnalysisUrl(fen), [fen]);

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      replaceUrlWithPuzzle(nextPuzzleIndex);
      return;
    }

    const nextOpeningIndex =
      remainingOpeningPuzzleIndexes.length > 0
        ? remainingOpeningPuzzleIndexes[
            Math.floor(Math.random() * remainingOpeningPuzzleIndexes.length)
          ]
        : null;

    const nextIndex =
      nextOpeningIndex ?? Math.floor(Math.random() * puzzles.length);

    if (nextOpeningIndex !== null) {
      setRemainingOpeningPuzzleIndexes((previous) =>
        previous.filter((index) => index !== nextOpeningIndex),
      );
    }

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    replaceUrlWithPuzzle(nextIndex);
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    replaceUrlWithPuzzle(previousPuzzleIndex);
  };

  return (
    <div className="page">
      <div className="panel">
        <h1>Atomic Puzzle Trainer</h1>

        <div className="controls">
          <div className="buttonRow">
            <button
              type="button"
              onClick={handlePreviousPuzzle}
              disabled={historyIndex <= 0}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={handleNextPuzzle}
              disabled={puzzles.length === 0}
            >
              Next
            </button>
            <a
              className={`analyzeButton ${!fen ? "disabled" : ""}`}
              href={analysisUrl}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!fen}
              onClick={(event) => {
                if (!fen) event.preventDefault();
              }}
            >
              Analyze
            </a>
          </div>
        </div>

        {boardState.error ? (
          <div className="errorText">{boardState.error}</div>
        ) : null}
        {loadingError ? <div className="errorText">{loadingError}</div> : null}

        <div className="fenBox">
          <div className="fenLabel">Current FEN</div>
          <code>{boardState.fen || fen || "No puzzle loaded"}</code>
        </div>

        <div className="lineBox">
          <div className="fenLabel">Move line (← / → to navigate)</div>
          <code>{boardState.line || "No moves yet"}</code>
        </div>
      </div>

      <div className="boardWrap">
        <div className="boardFrame">
          {boardState.showWrongMove ? (
            <div className="moveIndicator wrong" aria-label="Wrong move" />
          ) : null}
          {boardState.solved ? (
            <div className="moveIndicator correct" aria-label="Puzzle solved" />
          ) : null}
          {fen ? (
            <Chessboard
              fen={fen}
              orientation={orientation}
              coordinates
              solution={activePuzzle?.solution}
              onStateChange={setBoardState}
            />
          ) : (
            <div className="emptyBoard">Waiting for puzzle data...</div>
          )}
        </div>
      </div>
    </div>
  );
};
