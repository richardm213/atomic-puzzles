import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { Chessboard } from "../../components/Chessboard/Chessboard";
import { loadPuzzleLibrary } from "../../lib/puzzleLibrary";
import { fetchAttemptedPuzzleIds, recordPuzzleProgress } from "../../lib/supabasePuzzleProgress";
import { useAuth } from "../../context/AuthContext";
import { Seo } from "../../components/Seo/Seo";
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

const randomInt = (max) => {
  if (!Number.isInteger(max) || max <= 0) return 0;

  const cryptoObject = window.crypto;
  if (!cryptoObject?.getRandomValues) {
    return Math.floor(Math.random() * max);
  }

  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % max);
  const values = new Uint32Array(1);

  do {
    cryptoObject.getRandomValues(values);
  } while (values[0] >= limit);

  return values[0] % max;
};

const shuffleIndexes = (indexes) => {
  const shuffled = [...indexes];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
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

const isQuestionableMoveLabel = (move = "") => move.includes("?");

const compareSolutionMoves = (moveA = "", moveB = "", fallbackA = 0, fallbackB = 0) => {
  const questionableDiff =
    Number(isQuestionableMoveLabel(moveA)) - Number(isQuestionableMoveLabel(moveB));
  if (questionableDiff !== 0) return questionableDiff;
  return fallbackA - fallbackB;
};

const getMatchingSolutionLineIndexes = (solutionLines = [], currentAnalysisMoves = []) =>
  solutionLines.reduce((matches, line, index) => {
    if (currentAnalysisMoves.every((move, moveIndex) => line[moveIndex] === move)) {
      matches.push(index);
    }
    return matches;
  }, []);

const sortMatchingSolutionLineIndexes = ({
  solutionLines = [],
  currentPly = 0,
  matchingLineIndexes = [],
}) =>
  [...matchingLineIndexes].sort((a, b) =>
    compareSolutionMoves(
      solutionLines[a]?.[currentPly] ?? "",
      solutionLines[b]?.[currentPly] ?? "",
      a,
      b,
    ),
  );

const getActiveSolutionLineIndex = ({
  sortedMatchingLineIndexes = [],
  pinnedSolutionLineIndex,
  fallbackLineIndex = 0,
}) => {
  if (!sortedMatchingLineIndexes.length) return fallbackLineIndex;
  if (
    pinnedSolutionLineIndex !== null &&
    sortedMatchingLineIndexes.includes(pinnedSolutionLineIndex)
  ) {
    return pinnedSolutionLineIndex;
  }
  return sortedMatchingLineIndexes[0];
};

const buildSolutionOptions = ({
  solutionLines = [],
  currentAnalysisMoves = [],
  isOnSolutionPath,
}) => {
  if (!solutionLines.length || !isOnSolutionPath) return [];

  const currentPly = currentAnalysisMoves.length;
  const currentPrefix = currentAnalysisMoves.join("\n");
  const groupedOptions = new Map();

  solutionLines.forEach((line, lineIndex) => {
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

  return [...groupedOptions.values()].sort((a, b) =>
    compareSolutionMoves(a.move, b.move, a.lineIndex, b.lineIndex),
  );
};

const orderedChildren = (node) =>
  [...node.children.values()].sort((a, b) => {
    const moveOrder = compareSolutionMoves(a.move, b.move);
    if (moveOrder !== 0) return moveOrder;

    const firstLineDiff = (a.firstOccurrence?.lineIndex ?? 0) - (b.firstOccurrence?.lineIndex ?? 0);
    if (firstLineDiff !== 0) return firstLineDiff;
    return (a.firstOccurrence?.moveIndex ?? 0) - (b.firstOccurrence?.moveIndex ?? 0);
  });

const findMainChild = (children) => children[0];

const buildCompletionFeedback = (nextBoardState, solvedAfterRetry) => {
  if (nextBoardState.solved) {
    return solvedAfterRetry
      ? {
          type: "retrySuccess",
          icon: "↺",
          title: "Puzzle solved on retry",
        }
      : {
          type: "correct",
          icon: "✓",
          title: "Puzzle correct",
        };
  }

  if (nextBoardState.showWrongMove) {
    return {
      type: "wrong",
      icon: "×",
      title: "Puzzle incorrect",
    };
  }

  return null;
};

const createInitialBoardState = () => ({
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
  solved: false,
});

const createInitialBoardSnapshot = () => ({
  fen: "",
  lineIndex: 0,
  solutionLineIndex: 0,
  viewingSolution: false,
  showWrongMove: false,
  solved: false,
});

export const PuzzleSolverPage = () => {
  const navigate = useNavigate();
  const { puzzleId: routePuzzleId = "" } = useParams({ strict: false });
  const { isAuthenticated, user } = useAuth();
  const [puzzles, setPuzzles] = useState([]);
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState(() => new Set());
  const [loadingError, setLoadingError] = useState("");
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileFeedback, setMobileFeedback] = useState(null);
  const [showSolution, setShowSolution] = useState(false);
  const [solutionNavigation, setSolutionNavigation] = useState(null);
  const [retrySignal, setRetrySignal] = useState(0);
  const [solvedAfterRetry, setSolvedAfterRetry] = useState(false);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [completionFeedback, setCompletionFeedback] = useState(null);
  const [pinnedSolutionLineIndex, setPinnedSolutionLineIndex] = useState(null);
  const [boardState, setBoardState] = useState(createInitialBoardState);
  const previousBoardSnapshotRef = useRef(createInitialBoardSnapshot());
  const analysisModeRef = useRef(false);
  const mobileFeedbackIdRef = useRef(0);
  const activeSolutionOptionRef = useRef(null);
  const upcomingPuzzleIndexesRef = useRef([]);
  const progressWriteQueueRef = useRef(Promise.resolve());

  const getNextShuffledPuzzleIndex = useCallback(
    (currentIndex) => {
      if (puzzles.length === 0) return -1;
      if (puzzles.length === 1) return 0;

      if (upcomingPuzzleIndexesRef.current.length === 0) {
        const candidateIndexes = puzzles
          .map((_, index) => index)
          .filter(
            (index) =>
              index !== currentIndex &&
              !attemptedPuzzleIds.has(String(puzzles[index]?.puzzleId ?? "")),
          );
        upcomingPuzzleIndexesRef.current = shuffleIndexes(candidateIndexes);
      }

      return upcomingPuzzleIndexesRef.current.pop() ?? -1;
    },
    [attemptedPuzzleIds, puzzles],
  );

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
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();

    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const loadPuzzles = async () => {
      try {
        setLoadingError("");
        const loadedPuzzles = await loadPuzzleLibrary();
        if (isCurrent) setPuzzles(loadedPuzzles);
      } catch (error) {
        if (!isCurrent) return;
        setPuzzles([]);
        setLoadingError(error.message || "Failed to load puzzles");
      }
    };

    loadPuzzles();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const loadAttemptedPuzzleIds = async () => {
      try {
        const attemptedIds = user?.username
          ? await fetchAttemptedPuzzleIds(user.username)
          : new Set();
        if (isCurrent) setAttemptedPuzzleIds(attemptedIds);
      } catch (error) {
        if (!isCurrent) return;
        setAttemptedPuzzleIds(new Set());
        globalThis.console?.error(error);
      }
    };

    loadAttemptedPuzzleIds();

    return () => {
      isCurrent = false;
    };
  }, [user?.username]);

  useEffect(() => {
    upcomingPuzzleIndexesRef.current = [];
  }, [attemptedPuzzleIds, puzzles]);

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
      indexFromRoute >= 0 ? indexFromRoute : getNextShuffledPuzzleIndex(-1);

    setHistory([initialIndex]);
    setHistoryIndex(0);

    if (indexFromRoute < 0) {
      const puzzleId = puzzles[initialIndex]?.puzzleId;
      if (puzzleId !== undefined) {
        replaceUrlWithPuzzle(puzzleId);
      }
    }
  }, [puzzles, historyIndex, routePuzzleId, replaceUrlWithPuzzle, getNextShuffledPuzzleIndex]);

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
  const activePuzzleId = activePuzzle?.puzzleId;
  const fen = activePuzzle?.fen ?? "";
  const author = activePuzzle?.author?.trim() || "Unknown";
  const event = activePuzzle?.event?.trim() || "";
  const orientation = orientationFromFen(fen);
  const currentFen = boardState.fen || fen;
  const startAnalysisUrl = lichessAnalysisUrl(fen);
  const currentAnalysisUrl = lichessAnalysisUrl(currentFen);
  const puzzleOrdinal = activePuzzleIndex >= 0 ? activePuzzleIndex + 1 : null;

  const enqueuePuzzleProgressWrite = useCallback(
    ({ puzzleId, puzzleCorrect }) => {
      if (!puzzleId || !user?.username) return;

      progressWriteQueueRef.current = progressWriteQueueRef.current
        .catch(() => {})
        .then(() =>
          recordPuzzleProgress({
            username: user.username,
            puzzleId,
            puzzleCorrect,
          }).then(() => {
            setAttemptedPuzzleIds((current) => {
              const next = new Set(current);
              next.add(String(puzzleId));
              return next;
            });
          }),
        )
        .catch((error) => {
          globalThis.console?.error(error);
        });
    },
    [user?.username],
  );

  const handleAttemptResolved = useCallback(
    ({ puzzleId, puzzleCorrect }) => {
      enqueuePuzzleProgressWrite({
        puzzleId,
        puzzleCorrect,
      });
    },
    [enqueuePuzzleProgressWrite],
  );

  const resetPuzzleUiState = useCallback(() => {
    setShowSolution(false);
    setSolutionNavigation(null);
    setSolvedAfterRetry(false);
    setAnalysisMode(false);
    setCompletionFeedback(null);
    setPinnedSolutionLineIndex(null);
  }, []);

  useEffect(() => {
    analysisModeRef.current = analysisMode;
  }, [analysisMode]);

  useEffect(() => {
    if (activePuzzleIndex < 0) return;

    upcomingPuzzleIndexesRef.current = upcomingPuzzleIndexesRef.current.filter(
      (index) => index !== activePuzzleIndex,
    );
  }, [activePuzzleIndex]);

  useEffect(() => {
    resetPuzzleUiState();
    setMobileFeedback(null);
    previousBoardSnapshotRef.current = createInitialBoardSnapshot();
  }, [activePuzzleId, resetPuzzleUiState]);

  useEffect(() => {
    if (!mobileFeedback) return undefined;

    const clearFeedbackTimer = window.setTimeout(() => {
      setMobileFeedback((current) =>
        current?.id === mobileFeedback.id
          ? {
              ...current,
              fading: true,
            }
          : current,
      );
    }, 1800);

    const removeFeedbackTimer = window.setTimeout(() => {
      setMobileFeedback((current) => (current?.id === mobileFeedback.id ? null : current));
    }, 2200);

    return () => {
      window.clearTimeout(clearFeedbackTimer);
      window.clearTimeout(removeFeedbackTimer);
    };
  }, [mobileFeedback]);

  const showFenDetails = analysisMode;
  const canRevealSolution = Boolean(fen) && (analysisMode || completionFeedback?.type === "wrong");
  const feedback = analysisMode ? completionFeedback : null;

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;
    resetPuzzleUiState();

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      const nextPuzzle = puzzles[nextPuzzleIndex];
      if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
      return;
    }

    const nextIndex = getNextShuffledPuzzleIndex(activePuzzleIndex);
    if (nextIndex < 0) return;

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    replaceUrlWithPuzzle(puzzles[nextIndex].puzzleId);
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    resetPuzzleUiState();
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    const previousPuzzle = puzzles[previousPuzzleIndex];
    if (previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
  };

  const handleToggleSolution = () => {
    if (isMobileLayout && !analysisMode && !showSolution && completionFeedback?.type === "wrong") {
      setAnalysisMode(true);
    }

    setShowSolution((prev) => !prev);
    setSolutionNavigation(null);
  };

  const showMobileFeedback = useCallback((nextFeedback) => {
    mobileFeedbackIdRef.current += 1;
    setMobileFeedback({
      ...nextFeedback,
      id: mobileFeedbackIdRef.current,
      fading: false,
    });
  }, []);

  const handleBoardStateChange = useCallback((nextBoardState) => {
    const previousBoardSnapshot = previousBoardSnapshotRef.current;
    const boardPositionChanged =
      previousBoardSnapshot.fen !== nextBoardState.fen ||
      previousBoardSnapshot.lineIndex !== nextBoardState.lineIndex ||
      previousBoardSnapshot.solutionLineIndex !== nextBoardState.solutionLineIndex ||
      previousBoardSnapshot.viewingSolution !== nextBoardState.viewingSolution;
    const nextCompletionFeedback = buildCompletionFeedback(nextBoardState, solvedAfterRetry);
    const deferMobileWrongAnalysis =
      isMobileLayout && !analysisModeRef.current && nextCompletionFeedback?.type === "wrong";
    const enteringAnalysisMode =
      !analysisModeRef.current && Boolean(nextCompletionFeedback) && !deferMobileWrongAnalysis;

    setBoardState(nextBoardState);

    if (isMobileLayout) {
      if ((enteringAnalysisMode || deferMobileWrongAnalysis) && nextCompletionFeedback) {
        showMobileFeedback(nextCompletionFeedback);
      } else if (!analysisModeRef.current && boardPositionChanged) {
        setMobileFeedback(null);
      }
    }

    if (enteringAnalysisMode && nextCompletionFeedback) {
      setAnalysisMode(true);
      setCompletionFeedback(nextCompletionFeedback);
    } else if (deferMobileWrongAnalysis) {
      setCompletionFeedback(nextCompletionFeedback);
    }

    if (
      analysisModeRef.current &&
      showSolution &&
      previousBoardSnapshot.viewingSolution &&
      previousBoardSnapshot.solutionLineIndex !== nextBoardState.solutionLineIndex
    ) {
      setPinnedSolutionLineIndex(nextBoardState.solutionLineIndex);
    }

    previousBoardSnapshotRef.current = {
      fen: nextBoardState.fen,
      lineIndex: nextBoardState.lineIndex,
      solutionLineIndex: nextBoardState.solutionLineIndex,
      viewingSolution: nextBoardState.viewingSolution,
      showWrongMove: nextBoardState.showWrongMove,
      solved: nextBoardState.solved,
    };

    if (nextBoardState.solved) {
      setSolutionNavigation(null);
    }
  }, [
    isMobileLayout,
    showMobileFeedback,
    showSolution,
    solvedAfterRetry,
  ]);

  const handleTryAgain = () => {
    setShowSolution(false);
    setSolutionNavigation(null);
    setSolvedAfterRetry(true);
    setAnalysisMode(false);
    setCompletionFeedback(null);
    setPinnedSolutionLineIndex(null);
    setRetrySignal((current) => current + 1);
  };

  const handleMoveClick = (lineIndex, moveIndex, { advance = false } = {}) => {
    setPinnedSolutionLineIndex(lineIndex);
    setSolutionNavigation({
      lineIndex,
      plyIndex: moveIndex + (advance ? 2 : 1),
    });
  };

  const handleAnalysisMoveClick = (moveIndex) => {
    setSolutionNavigation({
      plyIndex: moveIndex + 1,
      useHistory: true,
    });
  };

  const handleResetSolutionView = () => {
    const mainSolutionLine = boardState.solutionLines?.[0] ?? [];
    const targetPly = Math.min(currentAnalysisMoves.length, mainSolutionLine.length);
    setPinnedSolutionLineIndex(0);

    setSolutionNavigation({
      lineIndex: 0,
      plyIndex: targetPly,
    });
  };

  const currentAnalysisMoves = boardState.lineMoves?.slice(0, boardState.lineIndex) ?? [];
  const matchingSolutionLineIndexes = useMemo(
    () => getMatchingSolutionLineIndexes(boardState.solutionLines, currentAnalysisMoves),
    [boardState.solutionLines, currentAnalysisMoves],
  );

  const sortedMatchingSolutionLineIndexes = useMemo(
    () =>
      sortMatchingSolutionLineIndexes({
        solutionLines: boardState.solutionLines,
        currentPly: currentAnalysisMoves.length,
        matchingLineIndexes: matchingSolutionLineIndexes,
      }),
    [boardState.solutionLines, currentAnalysisMoves.length, matchingSolutionLineIndexes],
  );

  const activeSolutionLineIndex = useMemo(
    () =>
      getActiveSolutionLineIndex({
        sortedMatchingLineIndexes: sortedMatchingSolutionLineIndexes,
        pinnedSolutionLineIndex,
        fallbackLineIndex: boardState.solutionLineIndex,
      }),
    [boardState.solutionLineIndex, pinnedSolutionLineIndex, sortedMatchingSolutionLineIndexes],
  );
  const activeSolutionLine = boardState.solutionLines?.[activeSolutionLineIndex] ?? [];
  const isOnSolutionPath =
    matchingSolutionLineIndexes.length > 0 && activeSolutionLine.length >= currentAnalysisMoves.length;

  useEffect(() => {
    if (!analysisMode || !showSolution || !isOnSolutionPath) return;
    if (boardState.solutionLineIndex === activeSolutionLineIndex) return;

    setSolutionNavigation({
      lineIndex: activeSolutionLineIndex,
      plyIndex: currentAnalysisMoves.length,
    });
  }, [
    activeSolutionLineIndex,
    analysisMode,
    boardState.solutionLineIndex,
    currentAnalysisMoves.length,
    isOnSolutionPath,
    showSolution,
  ]);

  const solutionOptions = useMemo(
    () =>
      buildSolutionOptions({
        solutionLines: boardState.solutionLines,
        currentAnalysisMoves,
        isOnSolutionPath,
      }),
    [boardState.solutionLines, currentAnalysisMoves, isOnSolutionPath],
  );

  const hasSolutionOptions = solutionOptions.length > 1;
  const activeSolutionOption = solutionOptions.find((option) => option.lineIndex === activeSolutionLineIndex)
    ?.move ?? solutionOptions[0]?.move;

  useEffect(() => {
    activeSolutionOptionRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeSolutionOption]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (!analysisMode || !showSolution || !hasSolutionOptions) return;

      const isInputTarget =
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable);
      if (isInputTarget) return;

      const activeOptionIndex = solutionOptions.findIndex(
        (option) => option.lineIndex === activeSolutionLineIndex,
      );
      if (activeOptionIndex === -1) return;

      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextOptionIndex =
        (activeOptionIndex + delta + solutionOptions.length) % solutionOptions.length;
      const nextOption = solutionOptions[nextOptionIndex];
      if (!nextOption) return;

      event.preventDefault();
      handleMoveClick(nextOption.lineIndex, nextOption.plyIndex - 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSolutionLineIndex,
    analysisMode,
    handleMoveClick,
    hasSolutionOptions,
    showSolution,
    solutionOptions,
  ]);

  const inlineSolutionMoves = useMemo(() => {
    if (!boardState.solutionLines?.length) return null;

    const tree = createMoveTree(boardState.solutionLines);

    const renderNode = (node, plyIndex, keyPrefix, forceMoveNumber = false) => {
      const availableLineIndexes = [...node.lineIndexes.values()].sort((a, b) => a - b);
      const targetLineIndex = node.lineIndexes.has(activeSolutionLineIndex)
        ? activeSolutionLineIndex
        : (availableLineIndexes[0] ?? 0);

      const isActiveMove =
        isOnSolutionPath &&
        node.lineIndexes.has(activeSolutionLineIndex) &&
        currentAnalysisMoves.length === plyIndex + 1;

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

    const rootMain =
      rootChildren.find((child) => child.lineIndexes.has(activeSolutionLineIndex)) ??
      findMainChild(rootChildren);
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
    boardState.solutionLines,
    activeSolutionLineIndex,
    handleMoveClick,
    currentAnalysisMoves.length,
    isOnSolutionPath,
  ]);

  const renderMoveLine = (className = "lineBox") => (
    <div className={className}>
      <div className="lineHeader">
        <div className="fenLabel">Solution</div>
        <div className="solutionHeaderActions">
          <button
            type="button"
            className="solutionNavButton"
            onClick={handleResetSolutionView}
            disabled={!boardState.solutionLines?.length}
            aria-label="Reset to main solution"
            title="Reset to main solution"
          >
            <FontAwesomeIcon icon={faRotateLeft} />
          </button>
        </div>
      </div>
      {boardState.solutionLines?.length ? (
        <>
          {hasSolutionOptions ? (
            <div className="solutionOptions">
              <span className="solutionOptionsLabel">{solutionOptions.length} options from here</span>
              <div className="solutionOptionList" role="list" aria-label="Solution options">
                {solutionOptions.map((option) => (
                  <button
                    key={`${option.lineIndex}-${option.plyIndex}-${option.move}`}
                    type="button"
                    className={`solutionOption ${option.move === activeSolutionOption ? "active" : ""}`}
                    ref={option.move === activeSolutionOption ? activeSolutionOptionRef : null}
                    onClick={() => handleMoveClick(option.lineIndex, option.plyIndex - 1)}
                  >
                    {movePrefix(currentAnalysisMoves.length, currentAnalysisMoves.length % 2 === 1)}
                    {option.move}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {isOnSolutionPath ? (
            <div className="moveList inlineSolutionTree" role="list" aria-label="Solution variations">
              {inlineSolutionMoves}
            </div>
          ) : boardState.lineMoves?.length ? (
            <div className="moveList" role="list" aria-label="Analysis line">
              {boardState.lineMoves.map((move, index) => (
                <button
                  key={`${move}-${index}`}
                  type="button"
                  className={`moveChip ${boardState.lineIndex === index + 1 ? "active" : ""}`}
                  onClick={() => handleAnalysisMoveClick(index)}
                >
                  {index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ""}
                  {move}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <code>No solution available</code>
      )}
    </div>
  );

  return (
    <div className="page puzzlePage">
      <Seo
        title={activePuzzleId ? `Atomic Chess Puzzle ${activePuzzleId}` : "Atomic Chess Puzzles"}
        description={
          activePuzzleId
            ? `Solve atomic chess puzzle ${activePuzzleId} and play through the full forcing line.`
            : "Solve atomic chess puzzles drawn from real games and community analysis."
        }
        path={activePuzzleId ? `/solve/${activePuzzleId}` : "/solve"}
      />
      <div className="panel puzzlePanel">
        <div className="puzzleHeader">
          <div>
            <p className="puzzleEyebrow">Atomic tactics</p>
            <h1>Find the best move</h1>
          </div>
          <div className="puzzleHeaderAside">
            {isAuthenticated ? (
              <Link className="puzzleHistoryLink" to="/solve/history">
                <FontAwesomeIcon icon={faClockRotateLeft} />
                <span>History</span>
              </Link>
            ) : null}
            <div className="puzzleCount" aria-label="Puzzle count">
              <span>{puzzleOrdinal ?? "-"}</span>
              <small>of {puzzles.length || "-"}</small>
            </div>
          </div>
        </div>

        {!isMobileLayout ? (
          <div className="controls">
            <div className="buttonRow puzzleActions">
              <button type="button" onClick={handlePreviousPuzzle} disabled={historyIndex <= 0}>
                Prev
              </button>
              <button type="button" onClick={handleNextPuzzle} disabled={puzzles.length === 0}>
                Next
              </button>
              <button
                type="button"
                className="puzzlePrimaryAction"
                onClick={handleToggleSolution}
                disabled={!canRevealSolution}
              >
                {showSolution ? "Hide solution" : "Show solution"}
              </button>
            </div>
          </div>
        ) : null}

        {boardState.error ? <div className="errorText">{boardState.error}</div> : null}
        {loadingError ? <div className="errorText">{loadingError}</div> : null}

        {!isMobileLayout ? (
          <div className="puzzleDetails">
            <div className="puzzleMetaRow">
              <div className="metaChip" title={author}>
                <span className="metaChipLabel">Author</span>
                <span className="metaChipValue">{author}</span>
              </div>
              {event ? (
                <div className="metaChip" title={event}>
                  <span className="metaChipLabel">Event</span>
                  <span className="metaChipValue">{event}</span>
                </div>
              ) : null}
            </div>
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
        ) : null}

        {!isMobileLayout && showSolution && canRevealSolution ? renderMoveLine() : null}
      </div>

      <div className="boardWrap">
        <div className={`boardFrame ${feedback ? `hasFeedback ${feedback.type}` : ""}`}>
          {!isMobileLayout ? (
            <div className={`feedbackBanner ${feedback ? feedback.type : ""}`} aria-live="polite">
              <span className={`feedbackIcon ${feedback ? "" : "neutral"}`.trim()} aria-hidden="true">
                {feedback ? feedback.icon : "?"}
              </span>
              <span className="feedbackCopy">
                <strong>{feedback ? feedback.title : boardState.status || "Ready"}</strong>
              </span>
              <div className="feedbackActionSlot">
                {feedback?.type === "wrong" ? (
                  <button type="button" className="feedbackAction" onClick={handleTryAgain}>
                    Try again
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {fen ? (
            <Chessboard
              puzzleId={activePuzzleId}
              fen={fen}
              orientation={orientation}
              coordinates
              solution={activePuzzle?.solution}
              showSolution={analysisMode && showSolution}
              analysisMode={analysisMode}
              autoRetryWrongMoves={isMobileLayout}
              solutionNavigation={solutionNavigation}
              retrySignal={retrySignal}
              onNavigateHandled={() => setSolutionNavigation(null)}
              onAttemptResolved={handleAttemptResolved}
              onStateChange={handleBoardStateChange}
            />
          ) : (
            <div className="emptyBoard">Waiting for puzzle data...</div>
          )}
          {isMobileLayout && mobileFeedback ? (
            <div
              className={`mobileFeedbackOverlay ${mobileFeedback.type} ${
                mobileFeedback.fading ? "fading" : ""
              }`.trim()}
              aria-live="polite"
              aria-atomic="true"
              key={mobileFeedback.id}
            >
              <span className="mobileFeedbackIcon" aria-hidden="true">
                {mobileFeedback.icon}
              </span>
              <span className="mobileFeedbackText">{mobileFeedback.title}</span>
            </div>
          ) : null}
        </div>
      </div>

      {isMobileLayout ? (
        <div className="mobileWorkflowPanel">
          <div className="mobileActionCard">
            <button
              type="button"
              className="puzzlePrimaryAction"
              onClick={handleToggleSolution}
              disabled={!canRevealSolution}
            >
              {showSolution ? "Hide solution" : "Show solution"}
            </button>
            {showFenDetails ? (
              <a
                className={`fenAnalyzeButton mobileAnalyzeButton ${!fen ? "disabled" : ""}`}
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
            ) : null}
          </div>

          {showSolution && canRevealSolution ? renderMoveLine("lineBox mobileLineBox") : null}

          <div className="puzzleDetails mobilePuzzleDetails">
            <div className="puzzleMetaRow">
              <div className="metaChip" title={author}>
                <span className="metaChipLabel">Author</span>
                <span className="metaChipValue">{author}</span>
              </div>
              {event ? (
                <div className="metaChip" title={event}>
                  <span className="metaChipLabel">Event</span>
                  <span className="metaChipValue">{event}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isMobileLayout ? (
        <div className="mobileBottomNav" aria-label="Puzzle navigation">
          <button type="button" onClick={handlePreviousPuzzle} disabled={historyIndex <= 0}>
            Prev
          </button>
          <button type="button" onClick={handleNextPuzzle} disabled={puzzles.length === 0}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
};
