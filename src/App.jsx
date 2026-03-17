import { useEffect, useMemo, useState } from "react";
import { Chessboard } from "./Chessboard";

const lichessAnalysisUrl = (fen) => {
  if (!fen) return "https://lichess.org/analysis/atomic";
  return `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;
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

export const App = () => {
  const [puzzles, setPuzzles] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loadingError, setLoadingError] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [navigateToPly, setNavigateToPly] = useState(null);
  const [boardState, setBoardState] = useState({
    fen: "",
    turn: "",
    status: "Loading puzzles...",
    winner: undefined,
    error: "",
    line: "",
    lineMoves: [],
    lineIndex: 0,
    viewingSolution: false,
    showWrongMove: false,
    showRetryMove: false,
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
          (item) =>
            typeof item?.fen === "string" &&
            item.fen.length > 0 &&
            hasSolution(item),
        );

        if (availablePuzzles.length === 0) {
          throw new Error(
            "No puzzles found with both a valid fen and a solution",
          );
        }

        if (!cancelled) {
          const firstIndexFromPath = puzzleIndexFromPath(
            availablePuzzles.length,
          );
          const firstIndex =
            firstIndexFromPath >= 0
              ? firstIndexFromPath
              : Math.floor(Math.random() * availablePuzzles.length);

          setPuzzles(availablePuzzles);
          setHistory([firstIndex]);
          setHistoryIndex(0);
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
  const author = activePuzzle?.author?.trim() || "Unknown";
  const event = activePuzzle?.event?.trim() || "";
  const orientation = orientationFromFen(fen);
  const analysisUrl = useMemo(() => lichessAnalysisUrl(fen), [fen]);

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;
    setShowSolution(false);
    setNavigateToPly(null);

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      replaceUrlWithPuzzle(nextPuzzleIndex);
      return;
    }

    const nextIndex = Math.floor(Math.random() * puzzles.length);

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    replaceUrlWithPuzzle(nextIndex);
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    setShowSolution(false);
    setNavigateToPly(null);
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    replaceUrlWithPuzzle(previousPuzzleIndex);
  };

  const handleToggleSolution = () => {
    setShowSolution((prev) => !prev);
    setNavigateToPly(0);
  };

  const handleMoveClick = (moveIndex) => {
    setNavigateToPly(moveIndex + 1);
  };

  return (
    <div className="page">
      <div className="panel">
        <h1>Atomic Puzzle Trainer</h1>
        <p>Available puzzles: {puzzles.length}</p>

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
            <button type="button" onClick={handleToggleSolution} disabled={!fen}>
              {showSolution ? "Hide solution" : "Show solution"}
            </button>
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

        <div className="fenBox">
          <div className="fenLabel">Puzzle author</div>
          <code>{author}</code>
        </div>

        {event ? (
          <div className="fenBox">
            <div className="fenLabel">Event</div>
            <code>{event}</code>
          </div>
        ) : null}

        <div className="lineBox">
          <div className="fenLabel">Move line (← / → to navigate)</div>
          {boardState.lineMoves?.length ? (
            <div className="moveList" role="list" aria-label="Move line">
              {boardState.lineMoves.map((move, index) => {
                const isActive =
                  boardState.viewingSolution && boardState.lineIndex === index + 1;
                return (
                  <button
                    key={`${move}-${index}`}
                    type="button"
                    className={`moveChip ${isActive ? "active" : ""}`}
                    onClick={() => handleMoveClick(index)}
                  >
                    {index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ""} {move}
                  </button>
                );
              })}
            </div>
          ) : (
            <code>{boardState.line || "No moves yet"}</code>
          )}
        </div>
      </div>

      <div className="boardWrap">
        <div className="boardFrame">
          {boardState.showWrongMove ? (
            <div className="moveIndicator wrong" aria-label="Wrong move" />
          ) : null}
          {boardState.showRetryMove ? (
            <div className="moveIndicator retry" aria-label="Try again" />
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
              showSolution={showSolution}
              navigateToPly={navigateToPly}
              onNavigateHandled={() => setNavigateToPly(null)}
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
