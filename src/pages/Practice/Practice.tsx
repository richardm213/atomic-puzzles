import "./Practice.css";

import {
  faArrowsRotate,
  faBookOpen,
  faCheck,
  faDice,
  faGear,
  faPause,
  faPlay,
  faRobot,
  faRotateLeft,
  faShuffle,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AtomicDbEngine,
  AtomicDbEngineControls,
  AtomicDbEvalBar,
} from "../../components/AtomicDbEngine/AtomicDbEngine";
import { BoardWorkspace } from "../../components/BoardWorkspace/BoardWorkspace";
import {
  isTextEntryTarget,
  shortcutIndexFromKeyboardEvent,
} from "../../components/Chessboard/boardShortcuts";
import type { OpeningDatabaseMove } from "../../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";
import { PlayedMoves } from "../../components/PlayedMoves/PlayedMoves";
import { Seo } from "../../components/Seo/Seo";
import { UsernamePickerModal } from "../../components/UsernamePickerModal/UsernamePickerModal";
import { AnalysisToolbar } from "../../features/analysisWorkspace/AnalysisToolbar";
import {
  AnalysisWorkspaceLayout,
  AnalysisWorkspacePanel,
} from "../../features/analysisWorkspace/AnalysisWorkspaceLayout";
import { OpeningExplorerPanel } from "../../features/analysisWorkspace/OpeningExplorerPanel";
import { useAtomicDbAnalysis } from "../../hooks/useAtomicDbAnalysis";
import { useAtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { useBoardDocument } from "../../hooks/useBoardDocument";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import { type OpeningExplorerRequest, useOpeningExplorer } from "../../hooks/useOpeningExplorer";
import { useUsernamePicker } from "../../hooks/useUsernamePicker";
import { findFairyStockfishMove } from "../../lib/practice/fairyStockfish";
import { movePrefix } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import { appAssetPath } from "../../utils/appAssetPath";
import { atomicDbPositionUrl } from "../../utils/atomicDb";
import { formatGameCount } from "../../utils/formatters";
import { lichessAtomicAnalysisUrl } from "../../utils/lichess";
import {
  buildOpeningExplorerUrl,
  fetchExplorerApiResponse,
  mergeExplorerApiResponses,
} from "../../utils/openingExplorer";
import {
  MAX_PRACTICE_PLAYERS,
  normalizeClockValue,
  normalizePracticeUsernames,
  type OpponentMode,
  type OpponentSource,
  type PlayerContinuation,
  type PracticeSide,
  usePracticeSettings,
} from "./usePracticeSettings";

const PRACTICE_AUTOMOVE_MIN_THINK_MS = 520;
const PLAYER_MIN_RATING = 1700;
const buildPracticePgn = (rootFen: string, moveText = ""): string =>
  [
    '[Variant "Atomic"]',
    '[SetUp "1"]',
    `[FEN "${rootFen}"]`,
    ...(moveText ? ["", moveText] : []),
  ].join("\n");
type PracticeMove = OpeningDatabaseMove;

type PracticeEngineStatus = "idle" | "thinking" | "error";
type PendingAutoMove = {
  fen: string;
  uci: string;
};

const formatClockTime = (milliseconds: number): string => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const oppositeSide = (side: PracticeSide): PracticeSide => (side === "white" ? "black" : "white");

const fetchGeneralPracticeExplorerResponse = (fen: string, signal: AbortSignal) =>
  fetchExplorerApiResponse(buildOpeningExplorerUrl({ fen, speeds: [0, 1] }), "practice", signal);

const fetchPracticeExplorerResponse = async ({
  fen,
  opponentSource,
  opponentUsernames,
  opponentSide,
  playerContinuation,
  signal,
}: {
  fen: string;
  opponentSource: OpponentSource;
  opponentUsernames: string[];
  opponentSide: PracticeSide;
  playerContinuation: PlayerContinuation;
  signal: AbortSignal;
}): Promise<OpeningExplorerRequest> => {
  if (opponentSource === "general") {
    return {
      response: await fetchGeneralPracticeExplorerResponse(fen, signal),
    };
  }

  const playerResponse = await Promise.all(
    opponentUsernames.map((opponentUsername) =>
      fetchExplorerApiResponse(
        buildOpeningExplorerUrl({
          fen,
          speeds: [0, 1],
          username: opponentUsername,
          color: opponentSide,
          minRating: PLAYER_MIN_RATING,
        }),
        "practice",
        signal,
      ),
    ),
  ).then(mergeExplorerApiResponses);

  if (playerContinuation === "general" && playerResponse.moves.length === 0) {
    return {
      response: await fetchGeneralPracticeExplorerResponse(fen, signal),
    };
  }

  return {
    response: playerResponse,
  };
};

const chooseOpponentMove = (moves: PracticeMove[], mode: OpponentMode): PracticeMove | null => {
  const firstMove = moves[0];
  if (!firstMove) return null;

  if (mode === "popular") {
    return moves.reduce((best, move) => (move.games > best.games ? move : best), firstMove);
  }

  if (mode === "random") {
    return moves[Math.floor(Math.random() * moves.length)] ?? firstMove;
  }

  const totalGames = moves.reduce((total, move) => total + Math.max(0, move.games), 0);
  if (totalGames <= 0) {
    return moves[Math.floor(Math.random() * moves.length)] ?? firstMove;
  }

  let roll = Math.random() * totalGames;
  for (const move of moves) {
    roll -= Math.max(0, move.games);
    if (roll <= 0) return move;
  }

  return moves.at(-1) ?? firstMove;
};

export const PracticePage = () => {
  const [atomicDbEngineSettings, setAtomicDbEngineSettings] = useAtomicDbEngineSettings({
    storageKey: "atomic-puzzles.practice.atomicdb-engine",
    defaultEnabled: false,
  });
  const { settings, setSettings, updateSettings } = usePracticeSettings();
  const {
    side,
    opponentMode,
    opponentSource,
    opponentUsernames,
    allowMultiplePlayers,
    playerContinuation,
    clockMinutes,
    clockIncrementSeconds,
    clockEnabled,
  } = settings;
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const remainingClockMsRef = useRef(clockMinutes * 60_000);
  const lastAutoFenRef = useRef("");
  const navigationRef = useRef<SolutionNavigation | null>(null);
  const triedMoveUcisByFenRef = useRef<Map<string, Set<string>>>(new Map());
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [practiceRootFen, setPracticeRootFen] = useState(STARTING_FEN);
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [pendingAutoMove, setPendingAutoMove] = useState<PendingAutoMove | null>(null);
  const {
    isOpen: usernamePickerOpen,
    recentUsernames,
    open: openPicker,
    close: closeUsernamePicker,
    remember: rememberUsername,
    removeRecent: removeRecentUsername,
  } = useUsernamePicker("player");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exhaustedFen, setExhaustedFen] = useState<string | null>(null);
  const [manualContinuationActive, setManualContinuationActive] = useState(false);
  const [movesOpen, setMovesOpen] = useState(true);
  const [hoveredMoveUci, setHoveredMoveUci] = useState<string | null>(null);
  const { copy: copyPgn, copyLabel: copyPgnLabel } = useCopyFeedback();
  const [randomPlayerLoading, setRandomPlayerLoading] = useState(false);
  const [randomPlayerError, setRandomPlayerError] = useState("");
  const [engineStatus, setEngineStatus] = useState<PracticeEngineStatus>("idle");
  const [engineError, setEngineError] = useState("");
  const [dismissedError, setDismissedError] = useState("");
  const [remainingClockMs, setRemainingClockMs] = useState(clockMinutes * 60_000);
  const [clockExpired, setClockExpired] = useState(false);
  const [gamePaused, setGamePaused] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);

  const currentFen = boardState?.fen || STARTING_FEN;
  const atomicDbAnalysis = useAtomicDbAnalysis(currentFen, atomicDbEngineSettings.enabled);
  const currentLichessAnalysisUrl = lichessAtomicAnalysisUrl(currentFen);
  const currentTurn = boardState?.turn || "white";
  const gameFinished = Boolean(boardState?.winner);
  const opponentSide = oppositeSide(side);
  const canUsePlayerSource = opponentSource === "general" || opponentUsernames.length > 0;
  const practiceExplorerCacheKey = useMemo(
    () =>
      JSON.stringify({
        fen: currentFen,
        manualContinuationActive,
        opponentSource,
        opponentUsernames,
        opponentSide,
        playerContinuation,
      }),
    [
      currentFen,
      manualContinuationActive,
      opponentSide,
      opponentSource,
      opponentUsernames,
      playerContinuation,
    ],
  );
  const requestExplorer = useCallback(
    (signal: AbortSignal) => {
      if (manualContinuationActive) return null;
      if (!canUsePlayerSource) {
        setExhaustedFen(null);
        return null;
      }

      setExhaustedFen(null);
      return fetchPracticeExplorerResponse({
        fen: currentFen,
        opponentSource,
        opponentUsernames,
        opponentSide,
        playerContinuation,
        signal,
      });
    },
    [
      canUsePlayerSource,
      currentFen,
      manualContinuationActive,
      opponentSide,
      opponentSource,
      opponentUsernames,
      playerContinuation,
    ],
  );
  const {
    moves: practiceMoves,
    recentGames,
    status,
    error,
  } = useOpeningExplorer({
    fen: currentFen,
    playerColor: opponentSide,
    showPerformance: opponentSource === "player",
    request: requestExplorer,
    cacheKey: practiceExplorerCacheKey,
  });
  const popupError =
    (status === "error" ? "Could not load database moves. Try again." : "") ||
    (engineStatus === "error" ? engineError : "") ||
    randomPlayerError;
  const visiblePopupError = popupError && popupError !== dismissedError ? popupError : "";

  useEffect(() => {
    if (!popupError) setDismissedError("");
  }, [popupError]);

  const databaseExhausted = exhaustedFen === currentFen;
  const engineFallbackReady = databaseExhausted && !manualContinuationActive && status === "ready";
  const selectedPlayerSummary =
    opponentUsernames.length === 0
      ? "Player"
      : opponentUsernames.length === 1
        ? opponentUsernames[0]
        : opponentUsernames.join(", ");
  const selectedPlayerTabLabel =
    opponentUsernames.length === 0
      ? "Player"
      : opponentUsernames.length === 1
        ? opponentUsernames[0]
        : `${opponentUsernames[0]} +${opponentUsernames.length - 1}`;
  const selectedPlayerTabDetail =
    opponentUsernames.length > 1
      ? `${opponentUsernames.length} players · as ${opponentSide}`
      : `as ${opponentSide}`;
  const moveList = useMemo(
    () => (boardState?.lineMoves ? [...boardState.lineMoves] : []),
    [boardState],
  );
  const currentPly = boardState?.lineIndex ?? 0;
  const currentMoveText = useMemo(
    () =>
      moveList
        .slice(0, currentPly)
        .map((move, index) => `${movePrefix(index, index % 2 === 1)}${move}`.trim())
        .join(" "),
    [currentPly, moveList],
  );
  const currentPracticePgn = useMemo(
    () => buildPracticePgn(practiceRootFen, currentMoveText),
    [currentMoveText, practiceRootFen],
  );
  const canStepBack = currentPly > 0;
  const canStepForward = currentPly < moveList.length;
  const totalGames = practiceMoves.reduce((total, move) => total + move.games, 0);
  const canRunPractice = canUsePlayerSource && !gameFinished && !(clockEnabled && clockExpired);
  const maxPracticePlayers = allowMultiplePlayers ? MAX_PRACTICE_PLAYERS : 1;
  const canAddPracticePlayer = opponentUsernames.length < maxPracticePlayers;
  const canChoosePracticePlayer = allowMultiplePlayers ? canAddPracticePlayer : true;

  const handleCopyPgn = useCallback(async (): Promise<void> => {
    await copyPgn(currentPracticePgn);
  }, [copyPgn, currentPracticePgn]);

  const queueNavigation = useCallback((nextNavigation: SolutionNavigation): void => {
    navigationRef.current = nextNavigation;
    setNavigation(nextNavigation);
  }, []);

  const clearHandledNavigation = useCallback(
    (handledNavigation: SolutionNavigation | null): void => {
      if (navigationRef.current !== handledNavigation) return;

      navigationRef.current = null;
      setNavigation(null);
    },
    [],
  );

  const recordTriedMove = useCallback((fen: string, uci: string): void => {
    const triedMoves = triedMoveUcisByFenRef.current.get(fen) ?? new Set<string>();
    triedMoves.add(uci);
    triedMoveUcisByFenRef.current.set(fen, triedMoves);
  }, []);

  const getUntriedMoves = useCallback((fen: string, moves: PracticeMove[]): PracticeMove[] => {
    const triedMoves = triedMoveUcisByFenRef.current.get(fen);
    if (!triedMoves?.size) return moves;

    return moves.filter((move) => !triedMoves.has(move.uci));
  }, []);

  const clearTriedMoves = useCallback((): void => {
    triedMoveUcisByFenRef.current.clear();
  }, []);

  const clearAutoMoveState = useCallback((): void => {
    lastAutoFenRef.current = "";
    setPendingAutoMove(null);
    setExhaustedFen(null);
  }, []);

  const resetOpponentMoveChoices = useCallback((): void => {
    clearAutoMoveState();
    clearTriedMoves();
    setManualContinuationActive(false);
  }, [clearAutoMoveState, clearTriedMoves]);

  const resetPracticeClock = useCallback(
    (minutes = clockMinutes, pauseGame = true): void => {
      const nextMilliseconds = minutes * 60_000;
      remainingClockMsRef.current = nextMilliseconds;
      setRemainingClockMs(nextMilliseconds);
      setClockExpired(nextMilliseconds <= 0);
      if (pauseGame) setGamePaused(true);
    },
    [clockMinutes],
  );

  const addPracticeIncrement = useCallback((): void => {
    if (clockExpired) return;
    const nextMilliseconds = remainingClockMsRef.current + clockIncrementSeconds * 1000;
    remainingClockMsRef.current = nextMilliseconds;
    setRemainingClockMs(nextMilliseconds);
  }, [clockExpired, clockIncrementSeconds]);

  const clockRunning =
    clockEnabled &&
    !clockExpired &&
    !gamePaused &&
    status === "ready" &&
    currentTurn === side &&
    currentPly === moveList.length &&
    !navigation &&
    !pendingAutoMove &&
    (!databaseExhausted || manualContinuationActive);

  useEffect(() => {
    if (!clockRunning) return;

    let lastTick = window.performance.now();
    const updateClock = (): void => {
      const now = window.performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      const nextMilliseconds = Math.max(0, remainingClockMsRef.current - elapsed);
      remainingClockMsRef.current = nextMilliseconds;
      setRemainingClockMs(nextMilliseconds);
      if (nextMilliseconds <= 0) {
        setClockExpired(true);
        setGamePaused(true);
      }
    };
    const interval = window.setInterval(updateClock, 100);

    return () => {
      updateClock();
      window.clearInterval(interval);
    };
  }, [clockRunning]);

  useEffect(() => {
    if (
      !canUsePlayerSource ||
      manualContinuationActive ||
      status !== "ready" ||
      databaseExhausted ||
      gamePaused ||
      currentTurn !== opponentSide ||
      navigation ||
      pendingAutoMove ||
      lastAutoFenRef.current === currentFen
    ) {
      return;
    }

    const autoMove = chooseOpponentMove(getUntriedMoves(currentFen, practiceMoves), opponentMode);
    if (!autoMove) {
      // The selected player -> optional general database chain is complete.
      setExhaustedFen(currentFen);
      if (opponentSource === "player" && playerContinuation === "manual") {
        setManualContinuationActive(true);
      }
      return;
    }

    const timeout = window.setTimeout(() => {
      lastAutoFenRef.current = currentFen;
      setPendingAutoMove({ fen: currentFen, uci: autoMove.uci });
    }, PRACTICE_AUTOMOVE_MIN_THINK_MS);

    return () => window.clearTimeout(timeout);
  }, [
    canUsePlayerSource,
    currentFen,
    currentTurn,
    databaseExhausted,
    gamePaused,
    getUntriedMoves,
    manualContinuationActive,
    navigation,
    opponentMode,
    opponentSide,
    opponentSource,
    pendingAutoMove,
    practiceMoves,
    playerContinuation,
    status,
  ]);

  useEffect(() => {
    setHoveredMoveUci(null);
  }, [currentFen]);

  useEffect(() => {
    if (
      !engineFallbackReady ||
      currentTurn !== opponentSide ||
      gamePaused ||
      navigation ||
      lastAutoFenRef.current === currentFen
    ) {
      if (!engineFallbackReady || currentTurn !== opponentSide || gamePaused || navigation) {
        setEngineStatus("idle");
        setEngineError("");
      }
      return;
    }

    const controller = new AbortController();
    setEngineStatus("thinking");
    setEngineError("");

    void findFairyStockfishMove(
      currentFen,
      controller.signal,
      triedMoveUcisByFenRef.current.get(currentFen),
    )
      .then((uci) => {
        if (controller.signal.aborted) return;
        if (!uci) {
          throw new Error(
            triedMoveUcisByFenRef.current.get(currentFen)?.size
              ? "No different safe engine move is available"
              : "Fairy-Stockfish found no legal move",
          );
        }

        lastAutoFenRef.current = currentFen;
        setEngineStatus("idle");
        setPendingAutoMove({ fen: currentFen, uci });
      })
      .catch((engineFailure) => {
        if (controller.signal.aborted) return;
        setEngineStatus("error");
        setEngineError(
          engineFailure instanceof Error ? engineFailure.message : "Fairy-Stockfish failed",
        );
      });

    return () => controller.abort();
  }, [currentFen, currentTurn, engineFallbackReady, gamePaused, navigation, opponentSide]);

  useEffect(() => {
    if (!pendingAutoMove || navigation) return;

    recordTriedMove(pendingAutoMove.fen, pendingAutoMove.uci);
    queueNavigation({ type: "play", uci: pendingAutoMove.uci });
  }, [navigation, pendingAutoMove, queueNavigation, recordTriedMove]);

  useEffect(() => {
    if (!pendingAutoMove || currentTurn === opponentSide) return;

    setPendingAutoMove(null);
  }, [currentTurn, opponentSide, pendingAutoMove]);

  const playPracticeMove = useCallback(
    (uci: string): void => {
      if (currentTurn === side && !gamePaused) addPracticeIncrement();
      clearAutoMoveState();
      setHoveredMoveUci(null);
      recordTriedMove(currentFen, uci);
      queueNavigation({ type: "play", uci });
    },
    [
      addPracticeIncrement,
      currentFen,
      currentTurn,
      gamePaused,
      queueNavigation,
      recordTriedMove,
      side,
      clearAutoMoveState,
    ],
  );

  const toggleGamePaused = useCallback((): void => {
    if (!canRunPractice) return;

    if (gamePaused) {
      lastAutoFenRef.current = "";
      setSessionStarted(true);
      setGamePaused(false);
      return;
    }

    lastAutoFenRef.current = "";
    setPendingAutoMove(null);
    setGamePaused(true);
  }, [canRunPractice, gamePaused]);

  useEffect(() => {
    if (!gameFinished) return;

    setPendingAutoMove(null);
    setGamePaused(true);
  }, [gameFinished]);

  const updateClockEnabled = useCallback(
    (enabled: boolean): void => {
      updateSettings({ clockEnabled: enabled });
      if (enabled) {
        resetPracticeClock(clockMinutes, false);
      }
    },
    [clockMinutes, resetPracticeClock, updateSettings],
  );

  const requestNavigation = useCallback(
    (command: PlaybackCommand): void => {
      clearAutoMoveState();
      setManualContinuationActive(false);
      if (command === "previous" || command === "start") {
        setGamePaused(true);
      }
      queueNavigation({ type: "command", command });
    },
    [clearAutoMoveState, queueNavigation],
  );

  const navigateToPly = useCallback(
    (plyIndex: number): void => {
      clearAutoMoveState();
      setManualContinuationActive(false);
      if (plyIndex < currentPly) {
        setGamePaused(true);
      }
      queueNavigation({ type: "history", ply: plyIndex });
    },
    [clearAutoMoveState, currentPly, queueNavigation],
  );

  const handleBoardStateChange = useCallback(
    (nextState: ChessboardState): void => {
      if (
        navigationRef.current === null &&
        boardState?.turn === side &&
        nextState.turn === opponentSide &&
        (nextState.lineIndex ?? 0) > (boardState.lineIndex ?? 0)
      ) {
        if (!gamePaused) addPracticeIncrement();
      }
      setBoardState(nextState);
    },
    [addPracticeIncrement, boardState, gamePaused, opponentSide, side],
  );

  useBoardWheelNavigation({
    boardPanelRef,
    canStepBack,
    canStepForward,
    onNavigate: requestNavigation,
  });

  const flipPracticeSide = useCallback((): void => {
    resetOpponentMoveChoices();
    resetPracticeClock();
    setSettings((current) => ({ ...current, side: oppositeSide(current.side) }));
  }, [resetOpponentMoveChoices, resetPracticeClock, setSettings]);

  const openUsernamePicker = useCallback((): void => {
    updateSettings({ opponentSource: "player" });
    openPicker();
  }, [openPicker, updateSettings]);

  const resetBoardForOpponent = useCallback((): void => {
    resetOpponentMoveChoices();
    setHoveredMoveUci(null);
    resetPracticeClock();
    setSessionStarted(false);
    setPracticeRootFen(STARTING_FEN);
    queueNavigation({ type: "reset", fen: STARTING_FEN });
  }, [queueNavigation, resetOpponentMoveChoices, resetPracticeClock]);

  const restartPracticeGame = useCallback((): void => {
    resetOpponentMoveChoices();
    setHoveredMoveUci(null);
    resetPracticeClock();
    setSessionStarted(false);
    queueNavigation({ type: "reset", fen: practiceRootFen });
  }, [practiceRootFen, queueNavigation, resetOpponentMoveChoices, resetPracticeClock]);

  const boardDocument = useBoardDocument({
    fen: currentFen,
    pgn: currentPracticePgn,
    boardState,
    pgnAfterFenCommit: (nextFen) => buildPracticePgn(nextFen),
    onCommitFen: (nextFen) => {
      resetOpponentMoveChoices();
      setHoveredMoveUci(null);
      resetPracticeClock();
      setSessionStarted(false);
      setPracticeRootFen(nextFen);
      queueNavigation({ type: "reset", fen: nextFen });
    },
    onCommitPgn: (draft) => {
      resetOpponentMoveChoices();
      setHoveredMoveUci(null);
      resetPracticeClock();
      setSessionStarted(false);
      queueNavigation({ type: "loadPgn", pgn: draft, fen: practiceRootFen });
    },
  });

  const commitUsername = useCallback(
    (nextUsername: string): void => {
      const trimmedUsername = nextUsername.trim();
      if (!trimmedUsername) return;

      setSettings((current) => ({
        ...current,
        opponentUsernames: current.allowMultiplePlayers
          ? normalizePracticeUsernames([...current.opponentUsernames, trimmedUsername])
          : [trimmedUsername],
        opponentSource: "player",
      }));
      resetBoardForOpponent();
      rememberUsername(trimmedUsername);

      if (!allowMultiplePlayers) {
        closeUsernamePicker();
      }
    },
    [
      allowMultiplePlayers,
      closeUsernamePicker,
      rememberUsername,
      resetBoardForOpponent,
      setSettings,
    ],
  );

  const selectRandomPlayer = useCallback(async (): Promise<void> => {
    if (randomPlayerLoading || !canChoosePracticePlayer) return;

    setRandomPlayerLoading(true);
    setRandomPlayerError("");

    try {
      const response = await fetch(`${appAssetPath("/api/opening-explorer")}?randomPlayer=1`, {
        headers: { "X-Explorer-Intent": "visible" },
      });
      const data = (await response.json()) as { username?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not select a random player");
      }

      const username = data.username?.trim() ?? "";
      if (!username) throw new Error("No random player is available");

      commitUsername(username);
    } catch (randomError) {
      setRandomPlayerError(
        randomError instanceof Error ? randomError.message : "Could not select a random player",
      );
    } finally {
      setRandomPlayerLoading(false);
    }
  }, [canChoosePracticePlayer, commitUsername, randomPlayerLoading]);

  const clearSelectedPlayers = (): void => {
    updateSettings({ opponentUsernames: [], opponentSource: "player" });
    resetOpponentMoveChoices();
  };

  const removeOpponentUsername = useCallback(
    (usernameToRemove: string): void => {
      setSettings((current) => ({
        ...current,
        opponentUsernames: current.opponentUsernames.filter(
          (username) => username.toLowerCase() !== usernameToRemove.toLowerCase(),
        ),
      }));
      resetOpponentMoveChoices();
    },
    [resetOpponentMoveChoices, setSettings],
  );

  const updateAllowMultiplePlayers = (allowMultiple: boolean): void => {
    updateSettings({ allowMultiplePlayers: allowMultiple });
    resetOpponentMoveChoices();

    if (!allowMultiple) {
      setSettings((current) => ({
        ...current,
        opponentUsernames: current.opponentUsernames.slice(0, 1),
      }));
    }
  };

  const showGeneralOpponent = (): void => {
    updateSettings({ opponentSource: "general" });
    resetOpponentMoveChoices();
  };

  const showPlayerOpponent = (): void => {
    updateSettings({ opponentSource: "player" });
    resetOpponentMoveChoices();

    if (opponentUsernames.length === 0) {
      openUsernamePicker();
    }
  };

  const requestAlternateAutoMove = useCallback((): void => {
    clearAutoMoveState();

    if (currentTurn !== opponentSide && canStepBack) {
      queueNavigation({ type: "command", command: "previous" });
    }
  }, [canStepBack, clearAutoMoveState, currentTurn, opponentSide, queueNavigation]);

  useEffect(() => {
    const handlePracticeShortcut = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const shortcutIndex = shortcutIndexFromKeyboardEvent(event);
      const isMoveShortcut = shortcutIndex !== null;

      if (
        usernamePickerOpen ||
        (key !== "a" &&
          key !== "e" &&
          key !== "f" &&
          key !== "l" &&
          key !== "q" &&
          !isMoveShortcut) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (isTextEntryTarget(event.target)) return;

      if (isMoveShortcut) {
        if (movesOpen || settingsOpen || status !== "ready") return;

        const move = practiceMoves[shortcutIndex];
        if (!move) return;

        event.preventDefault();
        playPracticeMove(move.uci);
        return;
      }

      event.preventDefault();
      if (key === "e") {
        setMovesOpen((open) => !open);
        setSettingsOpen(false);
      } else if (key === "l") {
        setAtomicDbEngineSettings((current) => ({ ...current, enabled: !current.enabled }));
      } else if (key === "a") {
        toggleGamePaused();
      } else if (key === "q") {
        requestAlternateAutoMove();
      } else {
        flipPracticeSide();
      }
    };

    window.addEventListener("keydown", handlePracticeShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handlePracticeShortcut, { capture: true });
  }, [
    flipPracticeSide,
    movesOpen,
    playPracticeMove,
    practiceMoves,
    requestAlternateAutoMove,
    setAtomicDbEngineSettings,
    settingsOpen,
    status,
    toggleGamePaused,
    usernamePickerOpen,
  ]);

  const pageStyle = {
    "--analysis-board-size": "516px",
  } as CSSProperties;

  return (
    <AnalysisWorkspaceLayout className="practicePage" style={pageStyle}>
      <Seo
        title="Opening Database Practice"
        description="Practice atomic openings against the general database or a selected player's games."
        path="/practice"
      />

      <AnalysisWorkspacePanel
        className={`practicePanel ${settingsOpen ? "dbMovesCollapsed" : ""}`}
        aria-label="Practice controls"
      >
        <div className="practiceSessionControls" role="group" aria-label="Practice session">
          <div className="practiceHeaderTitle">
            <h1>Opening Database Practice</h1>
          </div>
          <div className="practiceStatus" aria-live="polite">
            <strong>{totalGames ? `${formatGameCount(totalGames)} games` : "0 games"}</strong>
          </div>

          <div
            className={`practiceClock ${clockExpired ? "expired" : ""} ${clockEnabled ? "" : "off"}`}
            aria-label={
              clockEnabled
                ? `Your clock: ${formatClockTime(remainingClockMs)}`
                : "Practice controls"
            }
          >
            {clockEnabled ? (
              <strong aria-live="off">{formatClockTime(remainingClockMs)}</strong>
            ) : null}
            <div className="practiceClockActions">
              <button
                type="button"
                onClick={toggleGamePaused}
                disabled={!canRunPractice}
                aria-label={
                  gamePaused ? (sessionStarted ? "Resume game" : "Start game") : "Pause game"
                }
                title={gamePaused ? "Start or resume game (A)" : "Pause game (A)"}
              >
                <FontAwesomeIcon icon={gamePaused ? faPlay : faPause} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={restartPracticeGame}
                aria-label="Restart game"
                title="Restart from the initial position"
              >
                <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="practiceHeaderActions">
            <button
              type="button"
              className="practiceSideButton"
              data-side={side}
              aria-label={`Play as ${opponentSide}`}
              title={`Playing as ${side}. Switch sides`}
              onClick={flipPracticeSide}
            >
              <FontAwesomeIcon icon={faArrowsRotate} aria-hidden="true" />
            </button>
          </div>
        </div>

        <section className="practiceSettings" aria-label="Opponent settings">
          <div className="practiceExplorerHeader">
            <div
              className="practiceExplorerTabs analysisExplorerTabs"
              role="tablist"
              aria-label="Opponent source"
            >
              <button
                type="button"
                role="tab"
                className={opponentSource === "general" ? "active" : ""}
                aria-selected={opponentSource === "general"}
                onClick={showGeneralOpponent}
              >
                <FontAwesomeIcon icon={faBookOpen} />
                <span>General</span>
              </button>
              <button
                type="button"
                role="tab"
                className={opponentSource === "player" ? "active" : ""}
                aria-selected={opponentSource === "player"}
                aria-label={`${selectedPlayerSummary} as ${opponentSide}`}
                title={`${selectedPlayerSummary} as ${opponentSide}`}
                onClick={showPlayerOpponent}
              >
                <span className="practiceExplorerPlayerLabel">
                  <span>{selectedPlayerTabLabel}</span>
                  <small>{selectedPlayerTabDetail}</small>
                </span>
              </button>
            </div>
            <div className="practiceExplorerActions">
              <span className="practiceActionTooltip" data-tooltip="Practice random opponent">
                <button
                  type="button"
                  className="practiceRandomBoppButton"
                  onClick={selectRandomPlayer}
                  disabled={randomPlayerLoading || !canChoosePracticePlayer}
                  aria-label="Practice a random opponent"
                >
                  <FontAwesomeIcon icon={faDice} />
                </button>
              </span>
              <span className="practiceActionTooltip" data-tooltip="Swap opponent’s move">
                <button
                  type="button"
                  className="practiceAlternateMoveButton"
                  onClick={requestAlternateAutoMove}
                  disabled={status !== "ready"}
                  aria-label="Choose a different opponent move"
                >
                  <FontAwesomeIcon icon={faShuffle} />
                </button>
              </span>
              <button
                type="button"
                className={`analysisFilterToggle ${settingsOpen ? "open" : ""}`}
                aria-label={settingsOpen ? "Close practice settings" : "Open practice settings"}
                aria-controls="practice-settings-panel"
                aria-expanded={settingsOpen}
                title={settingsOpen ? "Close settings" : "Settings"}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <FontAwesomeIcon icon={settingsOpen ? faXmark : faGear} />
              </button>
            </div>
          </div>
          {settingsOpen ? (
            <div className="analysisFilterPanel practiceSettingsPanel" id="practice-settings-panel">
              {opponentSource === "player" ? (
                <div className="analysisPlayerSettings practicePlayerSettings">
                  <span>{allowMultiplePlayers ? "Players" : "Player"}</span>
                  <div
                    className={`practicePlayerChooserRow ${allowMultiplePlayers ? "multiple" : "single"}`}
                  >
                    <button
                      type="button"
                      className="analysisPlayerNameButton"
                      onClick={openUsernamePicker}
                      disabled={!canChoosePracticePlayer}
                    >
                      {canChoosePracticePlayer
                        ? allowMultiplePlayers
                          ? "Add player"
                          : opponentUsernames[0] || "Choose player"
                        : "Player limit reached"}
                    </button>
                    {allowMultiplePlayers && opponentUsernames.length ? (
                      <button
                        type="button"
                        className="analysisOpponentClearButton"
                        aria-label={allowMultiplePlayers ? "Clear players" : "Clear player"}
                        title={allowMultiplePlayers ? "Clear players" : "Clear player"}
                        onClick={clearSelectedPlayers}
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    ) : null}
                  </div>
                  {allowMultiplePlayers && opponentUsernames.length ? (
                    <div className="practicePlayerChipList" aria-label="Selected players">
                      {opponentUsernames.map((opponentUsername) => (
                        <span className="practicePlayerChip" key={opponentUsername}>
                          <span>{opponentUsername}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${opponentUsername}`}
                            onClick={() => removeOpponentUsername(opponentUsername)}
                          >
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="practiceSettingGroup">
                <span>Move choice</span>
                <div className="practiceModeGrid" role="group" aria-label="Database move selection">
                  <button
                    type="button"
                    className={opponentMode === "frequency" ? "active" : ""}
                    aria-pressed={opponentMode === "frequency"}
                    onClick={() => updateSettings({ opponentMode: "frequency" })}
                  >
                    Frequency
                  </button>
                  <button
                    type="button"
                    className={opponentMode === "random" ? "active" : ""}
                    aria-pressed={opponentMode === "random"}
                    onClick={() => updateSettings({ opponentMode: "random" })}
                  >
                    Random
                  </button>
                  <button
                    type="button"
                    className={opponentMode === "popular" ? "active" : ""}
                    aria-pressed={opponentMode === "popular"}
                    onClick={() => updateSettings({ opponentMode: "popular" })}
                  >
                    Popular
                  </button>
                </div>
              </div>

              <label className="practiceCheckbox">
                <span>Enable clock</span>
                <input
                  type="checkbox"
                  checked={clockEnabled}
                  onChange={(event) => updateClockEnabled(event.target.checked)}
                />
              </label>

              {clockEnabled ? (
                <div className="practiceSettingGroup">
                  <span>Time control</span>
                  <div className="practiceTimeControl" aria-label="Practice time control">
                    <label>
                      <span>Minutes</span>
                      <input
                        type="number"
                        min="0"
                        max="180"
                        step="1"
                        value={clockMinutes}
                        onChange={(event) => {
                          const nextMinutes = normalizeClockValue(event.target.value, 0, 180);
                          updateSettings({ clockMinutes: nextMinutes });
                          resetPracticeClock(nextMinutes);
                        }}
                      />
                    </label>
                    <span aria-hidden="true">+</span>
                    <label>
                      <span>Increment</span>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        step="1"
                        value={clockIncrementSeconds}
                        onChange={(event) =>
                          updateSettings({
                            clockIncrementSeconds: normalizeClockValue(event.target.value, 0, 60),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <label className="practiceCheckbox">
                <span>Allow multiple players</span>
                <input
                  type="checkbox"
                  checked={allowMultiplePlayers}
                  onChange={(event) => updateAllowMultiplePlayers(event.target.checked)}
                />
              </label>

              {opponentSource === "player" ? (
                <div className="practiceSettingGroup">
                  <span>Continue with</span>
                  <div className="practiceSegmented" role="group" aria-label="Player continuation">
                    <button
                      type="button"
                      className={playerContinuation === "general" ? "active" : ""}
                      aria-pressed={playerContinuation === "general"}
                      onClick={() => {
                        updateSettings({ playerContinuation: "general" });
                        resetOpponentMoveChoices();
                      }}
                    >
                      General DB
                    </button>
                    <button
                      type="button"
                      className={playerContinuation === "manual" ? "active" : ""}
                      aria-pressed={playerContinuation === "manual"}
                      onClick={() => {
                        updateSettings({ playerContinuation: "manual" });
                        resetOpponentMoveChoices();
                      }}
                    >
                      Manual
                    </button>
                    <button
                      type="button"
                      className={playerContinuation === "stockfish" ? "active" : ""}
                      aria-pressed={playerContinuation === "stockfish"}
                      onClick={() => {
                        updateSettings({ playerContinuation: "stockfish" });
                        resetOpponentMoveChoices();
                      }}
                    >
                      <FontAwesomeIcon icon={faRobot} />
                      <span>Stockfish</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {movesOpen && !settingsOpen ? (
          <section className="analysisMovePanel practicePlayedMovesPanel" aria-label="Played moves">
            <AtomicDbEngineControls
              fen={currentFen}
              analysis={atomicDbAnalysis}
              settings={atomicDbEngineSettings}
              setSettings={setAtomicDbEngineSettings}
              onDisable={() => setHoveredMoveUci(null)}
            />
            <div className="analysisMoveContent">
              <AtomicDbEngine
                fen={currentFen}
                settings={atomicDbEngineSettings}
                analysis={atomicDbAnalysis}
                onPlayMove={playPracticeMove}
                onHoverMove={setHoveredMoveUci}
              />
              <PlayedMoves moves={moveList} currentPly={currentPly} onNavigate={navigateToPly} />
            </div>
          </section>
        ) : null}

        {!movesOpen && !settingsOpen ? (
          <OpeningExplorerPanel
            className="practiceMovesPanel"
            ariaLabel="Database moves"
            tableClassName="practiceMoveTableWrap"
            displayProps={{
              moves: practiceMoves,
              recentGames,
              status,
              error,
              emptyMessage:
                opponentSource === "player" && opponentUsernames.length === 0
                  ? "Choose a player or use the general database."
                  : "No database continuation.",
              showPerformance: opponentSource === "player",
              orientation: side,
              currentPly,
              onPlayMove: playPracticeMove,
              onHoverMove: setHoveredMoveUci,
              showInlineError: false,
            }}
          />
        ) : null}

        <AnalysisToolbar
          active={!movesOpen && !settingsOpen}
          ariaLabel="Practice navigation"
          canStepBack={canStepBack}
          canStepForward={canStepForward}
          className="practiceToolbar"
          onNavigate={requestNavigation}
          onToggle={() => {
            if (settingsOpen || movesOpen) {
              setSettingsOpen(false);
              setMovesOpen(false);
            } else {
              setMovesOpen(true);
            }
          }}
          toggleAriaLabel={movesOpen || settingsOpen ? "Show database moves" : "Show played moves"}
          toggleTitle={
            movesOpen || settingsOpen ? "Show database moves (E)" : "Show played moves (E)"
          }
        />
      </AnalysisWorkspacePanel>

      {usernamePickerOpen ? (
        <UsernamePickerModal
          id="practice-username-picker-title"
          title={allowMultiplePlayers ? "Choose players" : "Choose player"}
          recentUsernames={recentUsernames}
          selectedUsernames={opponentUsernames}
          maxSelectedUsernames={maxPracticePlayers}
          submitLabel={allowMultiplePlayers ? "Add" : "Choose"}
          showSelectedUsernames={allowMultiplePlayers}
          onClose={closeUsernamePicker}
          onSelectUsername={commitUsername}
          onRemoveRecentUsername={removeRecentUsername}
          onRemoveSelectedUsername={removeOpponentUsername}
        />
      ) : null}

      <BoardWorkspace
        className="practiceBoardColumn"
        boardPanelRef={boardPanelRef}
        boardAriaLabel="Atomic practice board"
        chessboardProps={{
          puzzleId: "practice",
          fen: practiceRootFen,
          orientation: side,
          coordinates: true,
          solution: "",
          showSolution: false,
          analysisMode: true,
          captureNavigationShortcuts: true,
          solutionNavigation: navigation,
          previewMove: hoveredMoveUci,
          onNavigateHandled: () => {
            const handledNavigation = navigation;
            clearHandledNavigation(handledNavigation);
          },
          onStateChange: handleBoardStateChange,
        }}
        boardOverlay={
          <AtomicDbEvalBar
            fen={currentFen}
            analysis={atomicDbAnalysis}
            enabled={atomicDbEngineSettings.enabled}
            orientation={side}
          />
        }
        lichessHref={currentLichessAnalysisUrl}
        atomicDbHref={
          atomicDbAnalysis.status === "ready" && atomicDbAnalysis.result?.position?.key
            ? atomicDbPositionUrl(atomicDbAnalysis.result.position.key)
            : undefined
        }
        actionClassName="practiceBoardActions"
        secondaryAction={
          <button type="button" className="practiceCopyPgnButton" onClick={handleCopyPgn}>
            {copyPgnLabel === "Copied" ? (
              <FontAwesomeIcon className="practiceCopyPgnCheck" icon={faCheck} aria-hidden="true" />
            ) : null}
            {copyPgnLabel}
          </button>
        }
        document={boardDocument}
      />

      {visiblePopupError ? (
        <div className="practiceErrorToast" role="alert" aria-atomic="true">
          <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
          <span>{visiblePopupError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setDismissedError(visiblePopupError)}
          >
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </AnalysisWorkspaceLayout>
  );
};
