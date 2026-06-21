import "./Analysis.css";

import {
  faBackward,
  faBackwardStep,
  faBookOpen,
  faDatabase,
  faExternalLinkAlt,
  faForward,
  faForwardStep,
  faMagnifyingGlassChart,
  faGear,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { Seo } from "../../components/Seo/Seo";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const previewMoves = [
  { move: "Nf3", games: "1.4M", white: 45, draw: 2, black: 53 },
  { move: "e3", games: "872k", white: 41, draw: 3, black: 56 },
  { move: "Nc3", games: "641k", white: 48, draw: 1, black: 51 },
  { move: "g3", games: "312k", white: 37, draw: 4, black: 59 },
  { move: "b3", games: "226k", white: 44, draw: 2, black: 54 },
];

const WIN_RATE_LABEL_MIN_PERCENT = 14;

const visibleWinRateLabel = (rate: number): string =>
  rate >= WIN_RATE_LABEL_MIN_PERCENT ? `${rate}%` : "";

const lichessAnalysisUrl = (fen: string): string =>
  `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;

export const AnalysisPage = () => {
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [selectedSpeeds, setSelectedSpeeds] = useState<string[]>(["bullet", "blitz"]);
  const [minRating, setMinRating] = useState(1700);

  const moveList = boardState?.lineMoves ?? [];
  const currentFen = boardState?.fen || STARTING_FEN;
  const currentLichessAnalysisUrl = lichessAnalysisUrl(currentFen);
  const currentPly = boardState?.lineIndex ?? 0;
  const canStepBack = currentPly > 0;
  const canStepForward = currentPly < moveList.length;

  const movePairs: Array<{
    number: number;
    white: string | undefined;
    black: string | undefined;
    whitePly: number;
    blackPly: number;
  }> = [];

  for (let index = 0; index < moveList.length; index += 2) {
    movePairs.push({
      number: Math.floor(index / 2) + 1,
      white: moveList[index],
      black: moveList[index + 1],
      whitePly: index + 1,
      blackPly: index + 2,
    });
  }

  const pgnText = movePairs.length
    ? `${movePairs
        .map((pair) => {
          const whiteMove = pair.white ?? "";
          return pair.black
            ? `${pair.number}. ${whiteMove} ${pair.black}`
            : `${pair.number}. ${whiteMove}`;
        })
        .join(" ")} *`
    : "*";

  const requestNavigation = (command: NonNullable<SolutionNavigation["command"]>): void => {
    setNavigation({ command });
  };

  const navigateToPly = (plyIndex: number): void => {
    setNavigation({ useHistory: true, plyIndex });
  };

  const toggleSpeed = (speed: string): void => {
    setSelectedSpeeds((currentSpeeds) => {
      if (currentSpeeds.includes(speed)) {
        return currentSpeeds.length > 1
          ? currentSpeeds.filter((currentSpeed) => currentSpeed !== speed)
          : currentSpeeds;
      }

      return [...currentSpeeds, speed];
    });
  };

  useEffect(() => {
    const handleAnalysisShortcut = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if ((key !== "e" && key !== "f") || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (isTypingTarget) return;

      if (key === "e") {
        setExplorerOpen((open) => !open);
      } else {
        setOrientation((current) => (current === "white" ? "black" : "white"));
      }
    };

    window.addEventListener("keydown", handleAnalysisShortcut);
    return () => window.removeEventListener("keydown", handleAnalysisShortcut);
  }, []);

  return (
    <section className="analysisPage">
      <Seo
        title="Analysis"
        description="Analyze atomic chess positions and browse opening explorer filters."
        path="/analysis"
      />

      <aside
        className={`analysisPanel analysisRightPanel ${explorerOpen ? "explorerOpen" : "explorerCollapsed"}`}
        aria-label="Analysis controls"
      >
        <div className="analysisMovePanel">
          <div className="analysisSectionTitle">
            <span>Moves</span>
          </div>
          <ol className="analysisMoveList" aria-label="Played moves" aria-live="polite">
            {movePairs.map((pair) => (
              <li key={pair.number}>
                <span className="analysisMoveNumber">{pair.number}.</span>
                {pair.white ? (
                  <button
                    type="button"
                    className={currentPly === pair.whitePly ? "active" : ""}
                    onClick={() => navigateToPly(pair.whitePly)}
                  >
                    {pair.white}
                  </button>
                ) : (
                  <span />
                )}
                {pair.black ? (
                  <button
                    type="button"
                    className={currentPly === pair.blackPly ? "active" : ""}
                    onClick={() => navigateToPly(pair.blackPly)}
                  >
                    {pair.black}
                  </button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ol>
        </div>

        {explorerOpen ? (
          <section className="analysisExplorerPanel" aria-label="Opening explorer">
            <div className="analysisExplorerCompactHeader">
              <div className="analysisExplorerTitle">
                <FontAwesomeIcon icon={faDatabase} />
                <span>Atomic DB</span>
              </div>
              <button
                type="button"
                className={`analysisFilterToggle ${filtersOpen ? "open" : ""}`}
                aria-expanded={filtersOpen}
                aria-controls="analysis-explorer-filters"
                aria-label="Opening explorer settings"
                title="Opening explorer settings"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <FontAwesomeIcon icon={faGear} />
              </button>
            </div>

            {filtersOpen ? (
              <div className="analysisFilterPanel" id="analysis-explorer-filters">
                <div className="analysisFilterGroup">
                  <span>Speed</span>
                  <div className="analysisSpeedToggles" aria-label="Speed filters">
                    {["bullet", "blitz"].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        className={selectedSpeeds.includes(speed) ? "active" : ""}
                        aria-pressed={selectedSpeeds.includes(speed)}
                        onClick={() => toggleSpeed(speed)}
                      >
                        {speed === "bullet" ? "Bullet" : "Blitz"}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="analysisRatingSlider">
                  <span>Min rating</span>
                  <output>{minRating}</output>
                  <input
                    type="range"
                    min="1700"
                    max="2200"
                    step="50"
                    value={minRating}
                    onChange={(event) => setMinRating(Number(event.target.value))}
                  />
                </label>
                <div className="analysisExplorerToolbar">
                  <button type="button" className="analysisPrimaryButton" disabled>
                    <FontAwesomeIcon icon={faMagnifyingGlassChart} />
                    Search
                  </button>
                </div>
              </div>
            ) : null}

            <div className="analysisExplorerTableWrap">
              <table className="analysisExplorerTable">
                <thead>
                  <tr>
                    <th>Move</th>
                    <th>Games</th>
                    <th>Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {previewMoves.map((row) => (
                    <tr key={row.move}>
                      <td>
                        <span className="analysisExplorerMove">{row.move}</span>
                      </td>
                      <td>{row.games}</td>
                      <td>
                        <div
                          className="analysisWinRateBar"
                          style={
                            {
                              "--white-rate": `${row.white}%`,
                              "--draw-rate": `${row.draw}%`,
                              "--black-rate": `${row.black}%`,
                            } as CSSProperties
                          }
                          aria-label={`White ${row.white}%, draw ${row.draw}%, black ${row.black}%`}
                        >
                          <span
                            className="white"
                            aria-hidden={row.white < WIN_RATE_LABEL_MIN_PERCENT}
                          >
                            {visibleWinRateLabel(row.white)}
                          </span>
                          <span
                            className="draw"
                            aria-hidden={row.draw < WIN_RATE_LABEL_MIN_PERCENT}
                          >
                            {visibleWinRateLabel(row.draw)}
                          </span>
                          <span
                            className="black"
                            aria-hidden={row.black < WIN_RATE_LABEL_MIN_PERCENT}
                          >
                            {visibleWinRateLabel(row.black)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="analysisBottomToolbar" aria-label="Analysis menu">
          <button
            type="button"
            className={`analysisToolbarButton explorer ${explorerOpen ? "active" : ""}`}
            aria-label={explorerOpen ? "Hide opening explorer" : "Show opening explorer"}
            aria-pressed={explorerOpen}
            title="Opening explorer"
            onClick={() => setExplorerOpen((open) => !open)}
          >
            <FontAwesomeIcon icon={faBookOpen} />
          </button>
          <button
            type="button"
            className="analysisToolbarButton"
            aria-label="Go to start"
            title="Go to start"
            disabled={!canStepBack}
            onClick={() => requestNavigation("start")}
          >
            <FontAwesomeIcon icon={faBackwardStep} />
          </button>
          <button
            type="button"
            className="analysisToolbarButton"
            aria-label="Previous move"
            title="Previous move"
            disabled={!canStepBack}
            onClick={() => requestNavigation("previous")}
          >
            <FontAwesomeIcon icon={faBackward} />
          </button>
          <button
            type="button"
            className="analysisToolbarButton"
            aria-label="Next move"
            title="Next move"
            disabled={!canStepForward}
            onClick={() => requestNavigation("next")}
          >
            <FontAwesomeIcon icon={faForward} />
          </button>
          <button
            type="button"
            className="analysisToolbarButton"
            aria-label="Go to latest move"
            title="Go to latest move"
            disabled={!canStepForward}
            onClick={() => requestNavigation("end")}
          >
            <FontAwesomeIcon icon={faForwardStep} />
          </button>
        </div>
      </aside>

      <div className="analysisBoardColumn">
        <div className="analysisBoardPanel" aria-label="Atomic chess board">
          <Chessboard
            puzzleId="analysis"
            fen={STARTING_FEN}
            orientation={orientation}
            coordinates
            solution=""
            showSolution={false}
            analysisMode
            solutionNavigation={navigation}
            onNavigateHandled={() => setNavigation(null)}
            onStateChange={setBoardState}
          />
        </div>
        <div className="analysisBoardTextPanel">
          <a
            className="analysisLichessLink"
            href={currentLichessAnalysisUrl}
            target="_blank"
            rel="noreferrer"
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} />
            <span>View on Lichess</span>
          </a>
          <div className="analysisFenBox">
            <span>FEN</span>
            <code>{currentFen}</code>
          </div>
          <div className="analysisPgnBox" aria-label="PGN">
            <span>PGN</span>
            <p aria-live="polite">{pgnText}</p>
          </div>
        </div>
      </div>

    </section>
  );
};
