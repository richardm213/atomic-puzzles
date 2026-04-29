import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { Chessboard } from "../../components/Chessboard/Chessboard";
import { loadPuzzleLibrary } from "../../lib/puzzles/puzzleLibrary";
import {
  buildSolutionMoveTree,
  compareMoves,
  findMainChild,
  movePrefix,
  orderedChildren,
  serializeSanLinesToPgn,
} from "../../lib/puzzles/solutionPgn";
import { fetchAttemptedPuzzleIds, recordPuzzleProgress } from "../../lib/supabase/supabasePuzzleProgress";
import { isRegisteredSiteUser } from "../../lib/supabase/supabaseUsers";
import { useAuth } from "../../context/AuthContext";
import { Seo } from "../../components/Seo/Seo";
import "./PuzzleSolver.css";

const lichessAnalysisUrl = (fen: string | null | undefined): string => {
  if (!fen) return "https://lichess.org/analysis/atomic";
  return `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;
};

const orientationFromFen = (fen: string | undefined): "black" | "white" => {
  const turn = fen?.split(" ")?.[1];
  return turn === "b" ? "black" : "white";
};

const parsePuzzleId = (puzzleIdParam: string | null | undefined): number | null => {
  if (!puzzleIdParam) return null;
  const puzzleId = Number.parseInt(String(puzzleIdParam), 10);
  if (Number.isNaN(puzzleId)) return null;
  return puzzleId;
};

const toPuzzleKey = (puzzleId: unknown): string =>
  puzzleId === undefined || puzzleId === null ? "" : String(puzzleId).trim();

const addValueToSet = (currentSet: Set<string>, value: string): Set<string> => {
  if (!value) return currentSet;
  const next = new Set(currentSet);
  next.add(value);
  return next;
};

const puzzleIndexFromParam = (puzzles: import("../../lib/puzzles/puzzleLibrary").Puzzle[], puzzleIdParam: string | null | undefined): number => {
  const puzzleId = parsePuzzleId(puzzleIdParam);
  if (puzzleId === null) return -1;

  const puzzleIndex = puzzles.findIndex((puzzle) => puzzle.puzzleId === puzzleId);
  return puzzleIndex;
};

const randomInt = (max: number): number => {
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
  } while ((values[0] ?? 0) >= limit);

  return (values[0] ?? 0) % max;
};

const shuffleIndexes = (indexes: number[]): number[] => {
  const shuffled = [...indexes];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const a = shuffled[index]!;
    const b = shuffled[swapIndex]!;
    shuffled[index] = b;
    shuffled[swapIndex] = a;
  }

  return shuffled;
};

type MoveTreeNode = import("../../lib/puzzles/solutionPgn").SolutionMoveNode<{
  lineIndexes: Set<number>;
}>;

const createMoveTree = (lines: string[][]): MoveTreeNode => {
  const tree = buildSolutionMoveTree(lines, () => ({ lineIndexes: new Set<number>() }));

  for (const [lineIndex, line] of lines.entries()) {
    let node: MoveTreeNode = tree;
    node.lineIndexes.add(lineIndex);

    for (const move of line) {
      const next = node.children.get(move);
      if (!next) break;
      node = next;
      node.lineIndexes.add(lineIndex);
    }
  }

  return tree;
};

const lineStartsWithMoves = (line: string[], moves: string[]): boolean =>
  moves.every((move, moveIndex) => line[moveIndex] === move);

const getMatchingSolutionLineIndexes = (
  solutionLines: string[][] | undefined = [],
  currentAnalysisMoves: string[] | undefined = [],
): number[] =>
  (solutionLines ?? []).reduce<number[]>((matches, line, index) => {
    if (lineStartsWithMoves(line, currentAnalysisMoves ?? [])) {
      matches.push(index);
    }
    return matches;
  }, []);

const sortMatchingSolutionLineIndexes = ({
  solutionLines,
  currentPly = 0,
  matchingLineIndexes,
}: {
  solutionLines?: string[][] | undefined;
  currentPly?: number | undefined;
  matchingLineIndexes?: number[] | undefined;
}): number[] => {
  const lines = solutionLines ?? [];
  return [...(matchingLineIndexes ?? [])].sort((a, b) =>
    compareMoves(lines[a]?.[currentPly] ?? "", lines[b]?.[currentPly] ?? "", a, b),
  );
};

const getActiveSolutionLineIndex = ({
  sortedMatchingLineIndexes,
  pinnedSolutionLineIndex,
  fallbackLineIndex = 0,
}: {
  sortedMatchingLineIndexes?: number[] | undefined;
  pinnedSolutionLineIndex?: number | null | undefined;
  fallbackLineIndex?: number | undefined;
}): number => {
  const matched = sortedMatchingLineIndexes ?? [];
  if (!matched.length) return fallbackLineIndex ?? 0;
  if (
    pinnedSolutionLineIndex !== null &&
    pinnedSolutionLineIndex !== undefined &&
    matched.includes(pinnedSolutionLineIndex)
  ) {
    return pinnedSolutionLineIndex;
  }
  return matched[0] ?? fallbackLineIndex ?? 0;
};

type SolutionOption = { move: string; lineIndex: number; plyIndex: number };
type CompletionFeedback = { type: string; icon: string; title: string };

const buildSolutionOptions = ({
  solutionLines,
  currentPly = 0,
  matchingLineIndexes,
}: {
  solutionLines?: string[][] | undefined;
  currentPly?: number | undefined;
  matchingLineIndexes?: number[] | undefined;
}): SolutionOption[] => {
  const lines = solutionLines ?? [];
  const lineIndexes = matchingLineIndexes ?? [];
  if (!lines.length || !lineIndexes.length) return [];

  const groupedOptions = new Map<string, SolutionOption>();

  lineIndexes.forEach((lineIndex) => {
    const line = lines[lineIndex];
    if (!line) return;
    const move = line[currentPly];
    if (!move) return;

    if (!groupedOptions.has(move)) {
      groupedOptions.set(move, {
        move,
        lineIndex,
        plyIndex: currentPly,
      });
    }
  });

  return [...groupedOptions.values()].sort((a, b) =>
    compareMoves(a.move, b.move, a.lineIndex, b.lineIndex),
  );
};

const buildCompletionFeedback = (
  nextBoardState: import("../../types/chessboard").ChessboardState,
  hadWrongAttempt: boolean,
): CompletionFeedback | null => {
  if (nextBoardState.solved) {
    return hadWrongAttempt
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

  if (nextBoardState.showRetryMove) {
    return {
      type: "retry",
      icon: "↺",
      title: "Try again",
    };
  }

  return null;
};

const createInitialBoardState = (): import("../../types/chessboard").ChessboardState => ({
  fen: "",
  turn: "",
  status: "Loading puzzles...",
  error: "",
  line: "",
  lineMoves: [] as string[],
  solutionLines: [] as string[][],
  solutionLineIndex: 0,
  lineIndex: 0,
  viewingSolution: false,
  showWrongMove: false,
  showRetryMove: false,
  solved: false,
});

const createInitialBoardSnapshot = () => ({
  fen: "",
  lineIndex: 0,
  solutionLineIndex: 0,
  viewingSolution: false,
});

const SOLVE_MODE = "solve";
const ANALYSIS_MODE = "analysis";
const SOLUTION_UNLOCK_HINT = "Make at least one attempt before viewing the solution.";

const copyTextToClipboard = async (value: string): Promise<boolean> => {
  if (!value) return false;

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the textarea fallback.
    }
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();
    return copied;
  } catch {
    return false;
  }
};

export const PuzzleSolverPage = () => {
  const navigate = useNavigate();
  const { puzzleId: routePuzzleId = "" } = useParams({ strict: false });
  const { isAuthenticated, user } = useAuth();
  const [canViewHistory, setCanViewHistory] = useState(false);
  const [puzzles, setPuzzles] = useState<import("../../lib/puzzles/puzzleLibrary").Puzzle[]>([]);
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [resolvedAttemptedPuzzleIds, setResolvedAttemptedPuzzleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingError, setLoadingError] = useState("");
  const [history, setHistory] = useState<number[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileFeedback, setMobileFeedback] = useState<
    | { type: string; icon: string; title: string; id: number; fading: boolean }
    | null
  >(null);
  const [showSolution, setShowSolution] = useState(false);
  const [solutionNavigation, setSolutionNavigation] = useState<
    import("../../types/chessboard").SolutionNavigation | null
  >(null);
  const [interactionMode, setInteractionMode] = useState(SOLVE_MODE);
  const [completionFeedback, setCompletionFeedback] = useState<
    { type: string; icon: string; title: string } | null
  >(null);
  const [pinnedSolutionLineIndex, setPinnedSolutionLineIndex] = useState<number | null>(null);
  const [copyPgnLabel, setCopyPgnLabel] = useState("Copy PGN");
  const [boardState, setBoardState] = useState(createInitialBoardState);
  const previousBoardSnapshotRef = useRef<ReturnType<typeof createInitialBoardSnapshot>>(createInitialBoardSnapshot());
  const interactionModeRef = useRef(SOLVE_MODE);
  const hadWrongAttemptRef = useRef(false);
  const lockedCompletionFeedbackRef = useRef<
    { type: string; icon: string; title: string } | null
  >(null);
  const mobileFeedbackIdRef = useRef(0);
  const activeSolutionOptionRef = useRef<HTMLButtonElement | null>(null);
  const upcomingPuzzleIndexesRef = useRef<number[]>([]);
  const progressWriteQueueRef = useRef(Promise.resolve());
  const attemptedPuzzleIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isCurrent = true;

    const loadHistoryAccess = async () => {
      if (!isAuthenticated || !user?.username) {
        setCanViewHistory(false);
        return;
      }

      try {
        const isRegistered = await isRegisteredSiteUser(user.username);
        if (!isCurrent) return;
        setCanViewHistory(isRegistered);
      } catch {
        if (!isCurrent) return;
        setCanViewHistory(false);
      }
    };

    loadHistoryAccess();

    return () => {
      isCurrent = false;
    };
  }, [isAuthenticated, user?.username]);

  const getNextShuffledPuzzleIndex = useCallback(
    (currentIndex: number): number => {
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
    (puzzleId: string | number): void => {
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
        setLoadingError(error instanceof Error ? error.message : "Failed to load puzzles");
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
        const attemptedIds: Set<string> = user?.username
          ? await fetchAttemptedPuzzleIds(user.username)
          : new Set<string>();
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
    attemptedPuzzleIdsRef.current = attemptedPuzzleIds;
  }, [attemptedPuzzleIds]);

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
    const initialIndex = indexFromRoute >= 0 ? indexFromRoute : getNextShuffledPuzzleIndex(-1);

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

  const activePuzzleIndex: number = historyIndex >= 0 ? (history[historyIndex] ?? -1) : -1;
  const activePuzzle = activePuzzleIndex >= 0 ? puzzles[activePuzzleIndex] ?? null : null;
  const activePuzzleId = activePuzzle?.puzzleId;
  const activePuzzleKey = toPuzzleKey(activePuzzleId);
  const fen = activePuzzle?.fen ?? "";
  const author = String(activePuzzle?.["author"] ?? "").trim() || "Unknown";
  const event = String(activePuzzle?.["event"] ?? "").trim();
  const orientation = orientationFromFen(fen);
  const currentFen = boardState.fen || fen;
  const startAnalysisUrl = lichessAnalysisUrl(fen);
  const currentAnalysisUrl = lichessAnalysisUrl(currentFen);
  const puzzleOrdinal = activePuzzleIndex >= 0 ? activePuzzleIndex + 1 : null;
  const isAnalysisMode = interactionMode === ANALYSIS_MODE;
  const hasPersistedAttempt = activePuzzleKey ? attemptedPuzzleIds.has(activePuzzleKey) : false;
  const hasResolvedAttempt = activePuzzleKey
    ? resolvedAttemptedPuzzleIds.has(activePuzzleKey)
    : false;
  const hasAttemptedActivePuzzle = hasPersistedAttempt || hasResolvedAttempt;

  const enqueuePuzzleProgressWrite = useCallback(
    ({
      puzzleId,
      puzzleCorrect,
    }: {
      puzzleId: string | number | null | undefined;
      puzzleCorrect: boolean;
    }): void => {
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      if (!normalizedPuzzleId || !user?.username) return;
      if (attemptedPuzzleIdsRef.current.has(normalizedPuzzleId)) return;

      progressWriteQueueRef.current = progressWriteQueueRef.current
        .catch(() => {})
        .then(() =>
          recordPuzzleProgress({
            username: user.username,
            puzzleId: normalizedPuzzleId,
            puzzleCorrect,
          }).then(() => {
            setAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
          }),
        )
        .catch((error) => {
          globalThis.console?.error(error);
        });
    },
    [user?.username],
  );

  const handleAttemptResolved = useCallback(
    ({ puzzleId, puzzleCorrect }: import("../../types/chessboard").AttemptResolved): void => {
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      setResolvedAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));

      enqueuePuzzleProgressWrite({
        puzzleId: normalizedPuzzleId,
        puzzleCorrect,
      });
    },
    [enqueuePuzzleProgressWrite],
  );

  const resetPuzzleUiState = useCallback(() => {
    setShowSolution(false);
    setSolutionNavigation(null);
    setInteractionMode(SOLVE_MODE);
    setCompletionFeedback(null);
    lockedCompletionFeedbackRef.current = null;
    setPinnedSolutionLineIndex(null);
    hadWrongAttemptRef.current = false;
  }, []);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    if (activePuzzleIndex < 0) return;

    upcomingPuzzleIndexesRef.current = upcomingPuzzleIndexesRef.current.filter(
      (index) => index !== activePuzzleIndex,
    );
  }, [activePuzzleIndex]);

  useEffect(() => {
    resetPuzzleUiState();
    setMobileFeedback(null);
    setCopyPgnLabel("Copy PGN");
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

  const showFenDetails = showSolution;
  const canRevealSolution = Boolean(fen) && hasAttemptedActivePuzzle;
  const solutionButtonTitle = hasAttemptedActivePuzzle
    ? showSolution
      ? "Hide solution"
      : "Show solution"
    : SOLUTION_UNLOCK_HINT;
  const feedback = completionFeedback;

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;
    resetPuzzleUiState();

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      const nextPuzzle = nextPuzzleIndex !== undefined ? puzzles[nextPuzzleIndex] : undefined;
      if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
      return;
    }

    const nextIndex = getNextShuffledPuzzleIndex(activePuzzleIndex);
    if (nextIndex < 0) return;

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    const nextPuzzle = puzzles[nextIndex];
    if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
  };

  const handlePreviousPuzzle = () => {
    if (historyIndex <= 0) return;
    resetPuzzleUiState();
    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    const previousPuzzle = previousPuzzleIndex !== undefined ? puzzles[previousPuzzleIndex] : undefined;
    if (previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
  };

  const handleToggleSolution = () => {
    if (!canRevealSolution) return;

    if (!showSolution) {
      setInteractionMode(ANALYSIS_MODE);
    }

    setShowSolution((prev) => !prev);
    setSolutionNavigation(null);
  };

  const showMobileFeedback = useCallback((nextFeedback: { type: string; icon: string; title: string }): void => {
    mobileFeedbackIdRef.current += 1;
    setMobileFeedback({
      ...nextFeedback,
      id: mobileFeedbackIdRef.current,
      fading: false,
    });
  }, []);

  const handleBoardStateChange = useCallback(
    (nextBoardState: import("../../types/chessboard").ChessboardState): void => {
      const previousBoardSnapshot = previousBoardSnapshotRef.current;
      const boardPositionChanged =
        previousBoardSnapshot.fen !== nextBoardState.fen ||
        previousBoardSnapshot.lineIndex !== nextBoardState.lineIndex ||
        previousBoardSnapshot.solutionLineIndex !== nextBoardState.solutionLineIndex ||
        previousBoardSnapshot.viewingSolution !== nextBoardState.viewingSolution;
      const nextCompletionFeedback = buildCompletionFeedback(
        nextBoardState,
        hadWrongAttemptRef.current,
      );
      const lockedCompletionFeedback =
        nextCompletionFeedback ?? lockedCompletionFeedbackRef.current;
      const enteringAnalysisMode =
        interactionModeRef.current !== ANALYSIS_MODE &&
        nextCompletionFeedback !== null &&
        nextCompletionFeedback.type !== "wrong" &&
        nextCompletionFeedback.type !== "retry";

      setBoardState(nextBoardState);

      if (isMobileLayout) {
        if (nextCompletionFeedback) {
          showMobileFeedback(nextCompletionFeedback);
        } else if (interactionModeRef.current === SOLVE_MODE && boardPositionChanged) {
          setMobileFeedback(null);
        }
      }

      if (nextBoardState.showWrongMove) {
        hadWrongAttemptRef.current = true;
      }

      if (nextCompletionFeedback) {
        lockedCompletionFeedbackRef.current = nextCompletionFeedback;
      }

      if (enteringAnalysisMode && nextCompletionFeedback) {
        setInteractionMode(ANALYSIS_MODE);
        setCompletionFeedback(nextCompletionFeedback);
      } else if (nextCompletionFeedback) {
        setCompletionFeedback(nextCompletionFeedback);
      } else if (lockedCompletionFeedback) {
        setCompletionFeedback(lockedCompletionFeedback);
      } else {
        setCompletionFeedback(null);
      }

      if (
        interactionModeRef.current === ANALYSIS_MODE &&
        showSolution &&
        previousBoardSnapshot.viewingSolution &&
        previousBoardSnapshot.solutionLineIndex !== nextBoardState.solutionLineIndex
      ) {
        setPinnedSolutionLineIndex(nextBoardState.solutionLineIndex ?? null);
      }

      previousBoardSnapshotRef.current = {
        fen: nextBoardState.fen,
        lineIndex: nextBoardState.lineIndex ?? 0,
        solutionLineIndex: nextBoardState.solutionLineIndex ?? 0,
        viewingSolution: nextBoardState.viewingSolution ?? false,
      };

      if (nextBoardState.solved) {
        setSolutionNavigation(null);
      }
    },
    [isMobileLayout, showMobileFeedback, showSolution],
  );

  const handleMoveClick = useCallback((lineIndex: number, moveIndex: number, { advance = false }: { advance?: boolean } = {}): void => {
    setPinnedSolutionLineIndex(lineIndex);
    setSolutionNavigation({
      lineIndex,
      plyIndex: moveIndex + (advance ? 2 : 1),
    });
  }, []);

  const handleAnalysisMoveClick = useCallback((moveIndex: number): void => {
    setSolutionNavigation({
      plyIndex: moveIndex + 1,
      useHistory: true,
    });
  }, []);

  const currentAnalysisMoves = useMemo(
    () => boardState.lineMoves?.slice(0, boardState.lineIndex) ?? [],
    [boardState.lineMoves, boardState.lineIndex],
  );

  const handleResetSolutionView = () => {
    const mainSolutionLine = boardState.solutionLines?.[0] ?? [];
    const targetPly = Math.min(currentAnalysisMoves.length, mainSolutionLine.length);
    setPinnedSolutionLineIndex(0);

    setSolutionNavigation({
      lineIndex: 0,
      plyIndex: targetPly,
    });
  };
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
    matchingSolutionLineIndexes.length > 0 &&
    activeSolutionLine.length >= currentAnalysisMoves.length;

  useEffect(() => {
    if (!isAnalysisMode || !showSolution || !isOnSolutionPath) return;
    if (boardState.solutionLineIndex === activeSolutionLineIndex) return;

    setSolutionNavigation({
      lineIndex: activeSolutionLineIndex,
      plyIndex: currentAnalysisMoves.length,
    });
  }, [
    activeSolutionLineIndex,
    boardState.solutionLineIndex,
    currentAnalysisMoves.length,
    isAnalysisMode,
    isOnSolutionPath,
    showSolution,
  ]);

  const solutionOptions = useMemo(
    () =>
      buildSolutionOptions({
        solutionLines: boardState.solutionLines,
        currentPly: currentAnalysisMoves.length,
        matchingLineIndexes: matchingSolutionLineIndexes,
      }),
    [boardState.solutionLines, currentAnalysisMoves.length, matchingSolutionLineIndexes],
  );

  const hasSolutionOptions = solutionOptions.length > 1;
  const activeSolutionOption =
    solutionOptions.find((option) => option.lineIndex === activeSolutionLineIndex)?.move ??
    solutionOptions[0]?.move;

  useEffect(() => {
    activeSolutionOptionRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeSolutionOption]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (!isAnalysisMode || !showSolution || !hasSolutionOptions) return;

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
    handleMoveClick,
    hasSolutionOptions,
    isAnalysisMode,
    showSolution,
    solutionOptions,
  ]);

  const inlineSolutionMoves = useMemo(() => {
    if (!boardState.solutionLines?.length) return null;

    const tree = createMoveTree(boardState.solutionLines);

    const renderNode = (
      node: MoveTreeNode,
      plyIndex: number,
      keyPrefix: string,
      forceMoveNumber: boolean = false,
    ): React.ReactNode[] => {
      const availableLineIndexes = [...node.lineIndexes.values()].sort((a, b) => a - b);
      const targetLineIndex = node.lineIndexes.has(activeSolutionLineIndex)
        ? activeSolutionLineIndex
        : (availableLineIndexes[0] ?? 0);

      const isActiveMove =
        isOnSolutionPath &&
        node.lineIndexes.has(activeSolutionLineIndex) &&
        currentAnalysisMoves.length === plyIndex + 1;

      const content: React.ReactNode[] = [
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

      if (main) {
        content.push(...renderNode(main, plyIndex + 1, `${keyPrefix}-main`));
      }
      return content;
    };

    const rootChildren = orderedChildren(tree);
    if (rootChildren.length === 0) return null;

    // Keep the displayed PGN structure stable when the user switches between
    // sibling solution options. The active option should highlight/navigation-target
    // a branch, but it should not reshuffle which root variation is rendered first.
    const rootMain = findMainChild(rootChildren);
    const rootVariations = rootChildren.filter((child) => child !== rootMain);

    const content: React.ReactNode[] = rootMain ? [...renderNode(rootMain, 0, "root-main")] : [];

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

  const moveLinePgn = useMemo(() => {
    if (boardState.solutionLines?.length && isOnSolutionPath) {
      return serializeSanLinesToPgn(fen, boardState.solutionLines);
    }

    if (!boardState.lineMoves?.length) return "";

    return boardState.lineMoves
      .map((move, index) => `${movePrefix(index, index % 2 === 1)}${move}`.trim())
      .join(" ");
  }, [boardState.lineIndex, boardState.lineMoves, boardState.solutionLines, fen, isOnSolutionPath]);

  const handleCopyPgn = useCallback(async () => {
    if (!moveLinePgn) return;

    const copied = await copyTextToClipboard(moveLinePgn);
    setCopyPgnLabel(copied ? "Copied" : "Copy failed");

    window.setTimeout(() => {
      setCopyPgnLabel("Copy PGN");
    }, 1800);
  }, [moveLinePgn]);

  const renderMoveLine = (className = "lineBox") => (
    <div className={className}>
      <div className="lineHeader">
        <div className="fenLabel">Solution</div>
        <div className="solutionHeaderActions">
          <button
            type="button"
            className="fenAnalyzeButton"
            onClick={handleCopyPgn}
            disabled={!moveLinePgn}
          >
            {copyPgnLabel}
          </button>
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
              <span className="solutionOptionsLabel">
                {solutionOptions.length} options from here
              </span>
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
            <div
              className="moveList inlineSolutionTree"
              role="list"
              aria-label="Solution variations"
            >
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
            <Link className="puzzleDashboardLink" to="/solve/sets">
              <span>Sets</span>
            </Link>
            {canViewHistory ? (
              <Link className="puzzleDashboardLink" to="/dashboard">
                <FontAwesomeIcon icon={faClockRotateLeft} />
                <span>Dashboard</span>
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
                title={solutionButtonTitle}
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
            </div>
            {event ? (
              <div className="puzzleMetaRow">
                <div className="metaChip" title={event}>
                  <span className="metaChipLabel">Event</span>
                  <span className="metaChipValue">{event}</span>
                </div>
              </div>
            ) : null}
            {showFenDetails ? (
              <div className="analysisButtonsRow">
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
                  Analyze Puzzle
                </a>
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
                  Analyze Current Position
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isMobileLayout && showSolution && canRevealSolution ? renderMoveLine() : null}
      </div>

      <div className="boardWrap">
        <div className={`boardFrame ${feedback ? `hasFeedback ${feedback.type}` : ""}`}>
          {!isMobileLayout ? (
            <div className={`feedbackBanner ${feedback ? feedback.type : ""}`} aria-live="polite">
              <span
                className={`feedbackIcon ${feedback ? "" : "neutral"}`.trim()}
                aria-hidden="true"
              >
                {feedback ? feedback.icon : "?"}
              </span>
              <span className="feedbackCopy">
                <strong>{feedback ? feedback.title : boardState.status || "Ready"}</strong>
              </span>
              <div className="feedbackActionSlot" />
            </div>
          ) : null}
          {fen ? (
            <Chessboard
              puzzleId={activePuzzleId}
              fen={fen}
              orientation={orientation}
              coordinates
              solution={activePuzzle?.solution ?? ""}
              showSolution={isAnalysisMode && showSolution}
              analysisMode={isAnalysisMode}
              solutionNavigation={solutionNavigation}
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
              title={solutionButtonTitle}
            >
              {showSolution ? "Hide solution" : "Show solution"}
            </button>
            {showFenDetails ? (
              <div className="mobileAnalyzeActions">
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
                  Analyze Puzzle
                </a>
                <a
                  className={`fenAnalyzeButton mobileAnalyzeButton ${!currentFen ? "disabled" : ""}`}
                  href={currentAnalysisUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!currentFen}
                  onClick={(event) => {
                    if (!currentFen) event.preventDefault();
                  }}
                >
                  Analyze Current Position
                </a>
              </div>
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
