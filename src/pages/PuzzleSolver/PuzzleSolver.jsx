import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Chessboard } from "../../components/Chessboard/Chessboard";
import { usePuzzleLibrary } from "../../hooks/usePuzzleLibrary";
import "./PuzzleSolver.css";

const lichessAnalysisUrl = (fen) => {
  if (!fen) return "https://lichess.org/analysis/atomic";
  return `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;
};

const orientationFromFen = (fen) => {
  const turn = fen?.split(" ")?.[1];
  return turn === "b" ? "black" : "white";
};

const parsePuzzleId = (puzzleIdParam) => {
  if (!puzzleIdParam) return null;
  const puzzleId = Number.parseInt(String(puzzleIdParam), 10);
  if (Number.isNaN(puzzleId)) return null;
  return puzzleId;
};

const puzzleIndexFromParam = (puzzles, puzzleIdParam) => {
  const puzzleId = parsePuzzleId(puzzleIdParam);
  if (puzzleId === null) return -1;

  const puzzleIndex = puzzles.findIndex((puzzle) => puzzle.puzzleId === puzzleId);
  return puzzleIndex;
};

const createMoveTree = (lines) => {
  const root = {
    children: new Map(),
    lineIndexes: new Set(),
    firstOccurrence: null,
  };

  for (const [lineIndex, line] of lines.entries()) {
    let node = root;
    node.lineIndexes.add(lineIndex);

    for (const [moveIndex, move] of line.entries()) {
      if (!node.children.has(move)) {
        node.children.set(move, {
          move,
          children: new Map(),
          lineIndexes: new Set(),
          firstOccurrence: { lineIndex, moveIndex },
        });
      }

      node = node.children.get(move);
      node.lineIndexes.add(lineIndex);
    }
  }

  return root;
};

const movePrefix = (plyIndex, force = false) => {
  if (plyIndex % 2 === 0) return `${Math.floor(plyIndex / 2) + 1}. `;
  if (force) return `${Math.floor(plyIndex / 2) + 1}... `;
  return "";
};

const orderedChildren = (node) =>
  [...node.children.values()].sort((a, b) => {
    const firstLineDiff = (a.firstOccurrence?.lineIndex ?? 0) - (b.firstOccurrence?.lineIndex ?? 0);
    if (firstLineDiff !== 0) return firstLineDiff;
    return (a.firstOccurrence?.moveIndex ?? 0) - (b.firstOccurrence?.moveIndex ?? 0);
  });

const findMainChild = (children) => children[0];

export const PuzzleSolverPage = () => {
  const navigate = useNavigate();
  const { puzzleId: routePuzzleId = "" } = useParams({ strict: false });
  const { puzzles, loadingError } = usePuzzleLibrary();
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSolution, setShowSolution] = useState(false);
  const [solutionNavigation, setSolutionNavigation] = useState(null);
  const [boardState, setBoardState] = useState({
    fen: "",
    turn: "",
    status: "Loading puzzles...",
    winner: undefined,
    error: "",
    line: "",
    lineMoves: [],
    solutionLines: [],
    solutionLineIndex: 0,
    lineIndex: 0,
    viewingSolution: false,
    showWrongMove: false,
    showRetryMove: false,
    solved: false,
  });

  const replaceUrlWithPuzzle = useCallback(
    (puzzleId) => {
      navigate({
        to: "/solve/$puzzleId",
        params: { puzzleId: String(puzzleId) },
        replace: true,
      });
    },
    [navigate],
  );

  useEffect(() => {
    setBoardState((prev) => {
      if (loadingError) {
        return {
          ...prev,
          status: "Puzzle load error",
          error: loadingError,
        };
      }

      if (!loadingError && prev.error) {
        return {
          ...prev,
          status: "",
          error: "",
        };
      }

      return prev;
    });
  }, [loadingError]);

  useEffect(() => {
    if (puzzles.length === 0) return;
    if (historyIndex >= 0) return;

    const indexFromRoute = puzzleIndexFromParam(puzzles, routePuzzleId);
    const initialIndex =
      indexFromRoute >= 0 ? indexFromRoute : Math.floor(Math.random() * puzzles.length);

    setHistory([initialIndex]);
    setHistoryIndex(0);

    if (indexFromRoute < 0) {
      const puzzleId = puzzles[initialIndex]?.puzzleId;
      if (puzzleId !== undefined) {
        replaceUrlWithPuzzle(puzzleId);
      }
    }
  }, [puzzles, historyIndex, routePuzzleId, replaceUrlWithPuzzle]);

  useEffect(() => {
    if (puzzles.length === 0) return;
    if (historyIndex < 0) return;

    const selectedIndex = puzzleIndexFromParam(puzzles, routePuzzleId);
    if (selectedIndex < 0) return;

    if (historyIndex >= 0 && history[historyIndex] === selectedIndex) return;

    const existingHistoryPosition = history.findIndex((entry) => entry === selectedIndex);
    if (existingHistoryPosition >= 0) {
      setHistoryIndex(existingHistoryPosition);
      return;
    }

    const truncatedHistory = historyIndex >= 0 ? history.slice(0, historyIndex + 1) : [];
    setHistory([...truncatedHistory, selectedIndex]);
    setHistoryIndex(truncatedHistory.length);
  }, [puzzles, routePuzzleId, history, historyIndex]);

  const activePuzzleIndex = historyIndex >= 0 ? history[historyIndex] : -1;
  const activePuzzle = activePuzzleIndex >= 0 ? puzzles[activePuzzleIndex] : null;
  const fen = activePuzzle?.fen ?? "";
  const author = activePuzzle?.author?.trim() || "Unknown";
  const event = activePuzzle?.event?.trim() || "";
  const orientation = orientationFromFen(fen);
  const currentFen = boardState.fen || fen;
  const startAnalysisUrl = useMemo(() => lichessAnalysisUrl(fen), [fen]);
  const currentAnalysisUrl = useMemo(() => lichessAnalysisUrl(currentFen), [currentFen]);
  const puzzleOrdinal = activePuzzleIndex >= 0 ? activePuzzleIndex + 1 : null;
  const showFenDetails = boardState.solved || boardState.showWrongMove;
  const feedback = boardState.solved
    ? {
        type: "correct",
        icon: "✓",
        title: "Correct",
        message: "Puzzle complete. Nice finish.",
      }
    : boardState.showWrongMove
      ? {
          type: "wrong",
          icon: "×",
          title: "Incorrect",
          message: "That move is not part of the solution.",
        }
      : boardState.showRetryMove
        ? {
          type: "retry",
          icon: "↺",
          title: "Try again",
          message: "A reasonable idea, but there is a stronger continuation.",
        }
        : null;

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;
    setShowSolution(false);
    setSolutionNavigation(null);

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      const nextPuzzle = puzzles[nextPuzzleIndex];
      if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
      return;
    }

    const nextIndex = Math.floor(Math.random() * puzzles.length);

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    replaceUrlWithPuzzle(puzzles[nextIndex].puzzleId);
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    setShowSolution(false);
    setSolutionNavigation(null);
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    const previousPuzzle = puzzles[previousPuzzleIndex];
    if (previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
  };

  const handleToggleSolution = () => {
    setShowSolution((prev) => !prev);
    setSolutionNavigation(null);
  };

  const handleMoveClick = (lineIndex, moveIndex) => {
    setSolutionNavigation({
      lineIndex,
      plyIndex: moveIndex + 1,
    });
  };

  const activeSolutionMoves = boardState.solutionLines?.[boardState.solutionLineIndex] ?? [];
  const solutionPlyCount = activeSolutionMoves.length;
  const canNavigateSolution =
    boardState.viewingSolution && boardState.solutionLines?.length > 0 && solutionPlyCount > 0;
  const canStepBackward = canNavigateSolution && boardState.lineIndex > 0;
  const canStepForward = canNavigateSolution && boardState.lineIndex < solutionPlyCount;

  const handleSolutionJump = (targetPly) => {
    if (!canNavigateSolution) return;

    setSolutionNavigation({
      lineIndex: boardState.solutionLineIndex,
      plyIndex: Math.max(0, Math.min(targetPly, solutionPlyCount)),
    });
  };

  const solutionOptions = useMemo(() => {
    if (!canNavigateSolution) return [];

    const activeLine = boardState.solutionLines[boardState.solutionLineIndex];
    if (!activeLine) return [];

    const currentPly = boardState.lineIndex;
    const currentPrefix = activeLine.slice(0, currentPly).join("\n");
    const groupedOptions = new Map();

    boardState.solutionLines.forEach((line, lineIndex) => {
      if (!line[currentPly]) return;
      if (line.slice(0, currentPly).join("\n") !== currentPrefix) return;

      const move = line[currentPly];
      if (!groupedOptions.has(move)) {
        groupedOptions.set(move, {
          move,
          lineIndex,
          plyIndex: currentPly,
        });
      }
    });

    return [...groupedOptions.values()];
  }, [
    boardState.lineIndex,
    boardState.solutionLineIndex,
    boardState.solutionLines,
    canNavigateSolution,
  ]);

  const hasSolutionOptions = solutionOptions.length > 1;
  const activeSolutionOption = activeSolutionMoves[boardState.lineIndex];

  const inlineSolutionMoves = useMemo(() => {
    if (!boardState.solutionLines?.length) return null;

    const tree = createMoveTree(boardState.solutionLines);

    const renderNode = (node, plyIndex, keyPrefix, forceMoveNumber = false) => {
      const availableLineIndexes = [...node.lineIndexes.values()].sort((a, b) => a - b);
      const targetLineIndex = node.lineIndexes.has(boardState.solutionLineIndex)
        ? boardState.solutionLineIndex
        : (availableLineIndexes[0] ?? 0);

      const isActiveMove =
        node.lineIndexes.has(boardState.solutionLineIndex) && boardState.lineIndex === plyIndex + 1;

      const content = [
        <button
          key={`${keyPrefix}-move-${plyIndex}-${node.move}`}
          type="button"
          className={`moveChip ${isActiveMove ? "active" : ""}`}
          onClick={() => handleMoveClick(targetLineIndex, plyIndex)}
        >
          {movePrefix(plyIndex, forceMoveNumber)}
          {node.move}
        </button>,
      ];

      const children = orderedChildren(node);
      if (children.length === 0) return content;

      const main = findMainChild(children);
      const variations = children.filter((child) => child !== main);

      variations.forEach((variation, variationIndex) => {
        const variationKey = `${keyPrefix}-variation-${plyIndex}-${variationIndex}`;
        content.push(
          <span key={`${variationKey}-open`} className="variationParen">
            (
          </span>,
        );
        content.push(
          ...renderNode(variation, plyIndex + 1, variationKey, (plyIndex + 1) % 2 === 1),
        );
        content.push(
          <span key={`${variationKey}-close`} className="variationParen">
            )
          </span>,
        );
      });

      content.push(...renderNode(main, plyIndex + 1, `${keyPrefix}-main`));
      return content;
    };

    const rootChildren = orderedChildren(tree);
    if (rootChildren.length === 0) return null;

    const rootMain = findMainChild(rootChildren, boardState.solutionLineIndex);
    const rootVariations = rootChildren.filter((child) => child !== rootMain);

    const content = [...renderNode(rootMain, 0, "root-main")];

    rootVariations.forEach((variation, index) => {
      const variationKey = `root-variation-${index}`;
      content.push(
        <span key={`${variationKey}-open`} className="variationParen">
          (
        </span>,
      );
      content.push(...renderNode(variation, 0, variationKey));
      content.push(
        <span key={`${variationKey}-close`} className="variationParen">
          )
        </span>,
      );
    });

    return content;
  }, [
    boardState.lineIndex,
    boardState.solutionLineIndex,
    boardState.solutionLines,
    handleMoveClick,
  ]);

  return (
    <div className="page puzzlePage">
      <div className="panel puzzlePanel">
        <div className="puzzleHeader">
          <div>
            <p className="puzzleEyebrow">Atomic tactics</p>
            <h1>Find the best move</h1>
          </div>
          <div className="puzzleCount" aria-label="Puzzle count">
            <span>{puzzleOrdinal ?? "-"}</span>
            <small>of {puzzles.length || "-"}</small>
          </div>
        </div>

        <div className="controls">
          <div className="buttonRow puzzleActions">
            <button type="button" onClick={handlePreviousPuzzle} disabled={historyIndex <= 0}>
              Prev
            </button>
            <button type="button" onClick={handleNextPuzzle} disabled={puzzles.length === 0}>
              Next
            </button>
            <button type="button" onClick={handleToggleSolution} disabled={!fen}>
              {showSolution ? "Hide solution" : "Show solution"}
            </button>
          </div>
        </div>

        {boardState.error ? <div className="errorText">{boardState.error}</div> : null}
        {loadingError ? <div className="errorText">{loadingError}</div> : null}

        <div className="puzzleDetails">
          <div className="detailItem">
            <div className="fenLabel">Author</div>
            <div>{author}</div>
          </div>
          {event ? (
            <div className="detailItem">
              <div className="fenLabel">Event</div>
              <div>{event}</div>
            </div>
          ) : null}
          {showFenDetails ? (
            <>
              <div className="fenDetails">
                <div className="fenHeader">
                  <div className="fenLabel">Puzzle FEN</div>
                  <a
                    className={`fenAnalyzeButton ${!fen ? "disabled" : ""}`}
                    href={startAnalysisUrl}
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
                <code>{fen || "No puzzle loaded"}</code>
              </div>
              <div className="fenDetails">
                <div className="fenHeader">
                  <div className="fenLabel">Current FEN</div>
                  <a
                    className={`fenAnalyzeButton ${!currentFen ? "disabled" : ""}`}
                    href={currentAnalysisUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!currentFen}
                    onClick={(event) => {
                      if (!currentFen) event.preventDefault();
                    }}
                  >
                    Analyze on Lichess
                  </a>
                </div>
                <code>{currentFen || "No puzzle loaded"}</code>
              </div>
            </>
          ) : null}
        </div>

        <div className="lineBox">
          <div className="lineHeader">
            <div className="fenLabel">Move line</div>
            {canNavigateSolution ? (
              <div className="solutionNav" aria-label="Solution navigation">
                <button
                  type="button"
                  className="solutionNavButton"
                  onClick={() => handleSolutionJump(0)}
                  disabled={!canStepBackward}
                  aria-label="Jump to start"
                >
                  ⏮
                </button>
                <button
                  type="button"
                  className="solutionNavButton"
                  onClick={() => handleSolutionJump(boardState.lineIndex - 1)}
                  disabled={!canStepBackward}
                  aria-label="Step backward"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="solutionNavButton"
                  onClick={() => handleSolutionJump(boardState.lineIndex + 1)}
                  disabled={!canStepForward}
                  aria-label="Step forward"
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="solutionNavButton"
                  onClick={() => handleSolutionJump(solutionPlyCount)}
                  disabled={!canStepForward}
                  aria-label="Jump to end"
                >
                  ⏭
                </button>
              </div>
            ) : null}
          </div>
          {boardState.viewingSolution && boardState.solutionLines?.length ? (
            <>
              {hasSolutionOptions ? (
                <div className="solutionOptions">
                  <span className="solutionOptionsLabel">
                    {solutionOptions.length} options from here
                  </span>
                  <div className="solutionOptionList" role="list" aria-label="Solution options">
                    {solutionOptions.map((option) => (
                      <button
                        key={`${option.lineIndex}-${option.plyIndex}-${option.move}`}
                        type="button"
                        className={`solutionOption ${
                          option.move === activeSolutionOption ? "active" : ""
                        }`}
                        onClick={() =>
                          setSolutionNavigation({
                            lineIndex: option.lineIndex,
                            plyIndex: option.plyIndex,
                          })
                        }
                      >
                        {movePrefix(boardState.lineIndex, boardState.lineIndex % 2 === 1)}
                        {option.move}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div
                className="moveList inlineSolutionTree"
                role="list"
                aria-label="Solution variations"
              >
                {inlineSolutionMoves}
              </div>
            </>
          ) : boardState.lineMoves?.length ? (
            <div className="moveList" role="list" aria-label="Move line">
              {boardState.lineMoves.map((move, index) => {
                const isActive = boardState.viewingSolution && boardState.lineIndex === index + 1;
                return (
                  <button
                    key={`${move}-${index}`}
                    type="button"
                    className={`moveChip ${isActive ? "active" : ""}`}
                    onClick={() => handleMoveClick(0, index)}
                  >
                    {index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ""}
                    {move}
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
        <div className={`boardFrame ${feedback ? `hasFeedback ${feedback.type}` : ""}`}>
          <div className={`feedbackBanner ${feedback ? feedback.type : ""}`} aria-live="polite">
            {feedback ? (
              <>
                <span className="feedbackIcon" aria-hidden="true">
                  {feedback.icon}
                </span>
                <span className="feedbackCopy">
                  <strong>{feedback.title}</strong>
                  <span>{feedback.message}</span>
                </span>
              </>
            ) : (
              <>
                <span className="feedbackIcon neutral" aria-hidden="true">
                  ?
                </span>
                <span className="feedbackCopy">
                  <strong>{boardState.status || "Ready"}</strong>
                  <span>Choose a move on the board.</span>
                </span>
              </>
            )}
          </div>
          {fen ? (
            <Chessboard
              fen={fen}
              orientation={orientation}
              coordinates
              solution={activePuzzle?.solution}
              showSolution={showSolution}
              solutionNavigation={solutionNavigation}
              onNavigateHandled={() => setSolutionNavigation(null)}
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
