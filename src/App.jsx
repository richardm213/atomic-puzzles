import { useEffect, useMemo, useState } from "react";
import Chessboard from "./Chessboard";

const lichessAnalysisUrl = (fen) => {
  if (!fen) return "https://lichess.org/analysis";
  return `https://lichess.org/analysis/${fen.replaceAll(" ", "_")}`;
};

const orientationFromFen = (fen) => {
  const turn = fen?.split(" ")?.[1];
  return turn === "b" ? "black" : "white";
};

const App = () => {
  const [orientation, setOrientation] = useState(null);
  const [puzzles, setPuzzles] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loadingError, setLoadingError] = useState("");
  const [boardState, setBoardState] = useState({
    fen: "",
    turn: "",
    status: "Loading puzzles...",
    winner: undefined,
    error: "",
    line: "",
    lineIndex: 0,
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

        const gamePuzzles = data.filter(
          (item) =>
            item?.source === "game" &&
            typeof item?.fen === "string" &&
            item.fen.length > 0,
        );

        if (gamePuzzles.length === 0) {
          throw new Error("No puzzles found with source: 'game'");
        }

        if (!cancelled) {
          const firstIndex = Math.floor(Math.random() * gamePuzzles.length);
          setPuzzles(gamePuzzles);
          setHistory([firstIndex]);
          setHistoryIndex(0);
          setOrientation(orientationFromFen(gamePuzzles[firstIndex].fen));
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

  const activePuzzleIndex = historyIndex >= 0 ? history[historyIndex] : -1;
  const activePuzzle =
    activePuzzleIndex >= 0 ? puzzles[activePuzzleIndex] : null;
  const fen = activePuzzle?.fen ?? "";
  const analysisUrl = useMemo(() => lichessAnalysisUrl(fen), [fen]);

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      setOrientation(orientationFromFen(puzzles[nextPuzzleIndex]?.fen));
      return;
    }

    const nextIndex = Math.floor(Math.random() * puzzles.length);
    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    setOrientation(orientationFromFen(puzzles[nextIndex]?.fen));
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    setOrientation(orientationFromFen(puzzles[previousPuzzleIndex]?.fen));
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

        <div className="statusBox">
          <div>
            <span className="statusLabel">Status</span>
            <strong>{boardState.status}</strong>
          </div>
          {boardState.error ? (
            <div className="errorText">{boardState.error}</div>
          ) : null}
          {loadingError ? (
            <div className="errorText">{loadingError}</div>
          ) : null}
        </div>

        <div className="fenBox">
          <div className="fenLabel">Orientation</div>
          <code>{orientation ?? "Not loaded"}</code>
        </div>

        <div className="fenBox">
          <div className="fenLabel">Active Puzzle</div>
          <code>{activePuzzle?.id ?? "Not loaded"}</code>
        </div>

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
        {fen ? (
          <Chessboard
            fen={fen}
            orientation={orientation ?? "white"}
            coordinates
            onStateChange={setBoardState}
          />
        ) : (
          <div className="emptyBoard">Waiting for puzzle data...</div>
        )}
      </div>
    </div>
  );
};

export default App;
