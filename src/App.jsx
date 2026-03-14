import { useEffect, useMemo, useState } from "react";
import Chessboard from "./Chessboard";

function lichessAnalysisUrl(fen) {
  if (!fen) return "https://lichess.org/analysis";
  return `https://lichess.org/analysis/${fen.replaceAll(" ", "_")}`;
}

export default function App() {
  const [orientation, setOrientation] = useState("white");
  const [coordinates, setCoordinates] = useState(true);
  const [puzzles, setPuzzles] = useState([]);
  const [puzzleIndex, setPuzzleIndex] = useState(-1);
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

    async function loadPuzzles() {
      try {
        setLoadingError("");
        const response = await fetch("/private/puzzles.json");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} while loading /private/puzzles.json`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Expected /private/puzzles.json to contain an array of puzzles");
        }

        const gamePuzzles = data.filter(
          (item) => item?.source === "game" && typeof item?.fen === "string" && item.fen.length > 0,
        );

        if (gamePuzzles.length === 0) {
          throw new Error("No puzzles found with source: 'game'");
        }

        if (!cancelled) {
          setPuzzles(gamePuzzles);
          setPuzzleIndex(Math.floor(Math.random() * gamePuzzles.length));
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
    }

    loadPuzzles();

    return () => {
      cancelled = true;
    };
  }, []);

  const activePuzzle = puzzleIndex >= 0 ? puzzles[puzzleIndex] : null;
  const fen = activePuzzle?.fen ?? "";

  const analysisUrl = useMemo(() => lichessAnalysisUrl(fen), [fen]);

  const handleNextPuzzle = () => {
    if (puzzles.length <= 1) return;
    setPuzzleIndex((current) => {
      const base = current < 0 ? 0 : current;
      return (base + 1) % puzzles.length;
    });
  };

  return (
    <div className="page">
      <div className="panel">
        <h1>Atomic Puzzle Trainer</h1>
        <p>
          Loads local puzzles from <code>private/puzzles.json</code>, picks a random game puzzle,
          and lets you step to the next one.
        </p>

        <div className="controls">
          <label>
            Orientation
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={coordinates}
              onChange={(e) => setCoordinates(e.target.checked)}
            />
            Coordinates
          </label>

          <div className="buttonRow">
            <button
              type="button"
              onClick={handleNextPuzzle}
              disabled={puzzles.length <= 1}
            >
              Next puzzle
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
              Analyze on Lichess
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
          {loadingError ? <div className="errorText">{loadingError}</div> : null}
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
            orientation={orientation}
            coordinates={coordinates}
            onStateChange={setBoardState}
          />
        ) : (
          <div className="emptyBoard">Waiting for puzzle data...</div>
        )}
      </div>
    </div>
  );
}
