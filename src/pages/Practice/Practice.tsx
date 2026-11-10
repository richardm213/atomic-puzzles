import "./Practice.css";

import {
  faBookOpen,
  faDice,
  faPause,
  faPlay,
  faPuzzlePiece,
  faRobot,
  faRotateLeft,
  faShuffle,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import type { CSSProperties, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { isApprovedPuzzleCreator } from "../../../shared/domain/puzzles/approvedPuzzleCreators";
import { AnalysisContinuationChoices } from "../../components/AnalysisMoveTree/AnalysisMoveTree";
import { AtomicDbEvalBar } from "../../components/AtomicDbEngine/AtomicDbEngine";
import { BoardClock } from "../../components/BoardClock/BoardClock";
import { BoardWorkspace } from "../../components/BoardWorkspace/BoardWorkspace";
import {
  isTextEntryTarget,
  shortcutIndexFromKeyboardEvent,
} from "../../components/Chessboard/boardShortcuts";
import { buildPgnHistory } from "../../components/Chessboard/pgnHistory";
import { MoveNotation } from "../../components/MoveNotation/MoveNotation";
import type { OpeningDatabaseMove } from "../../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";
import { Seo } from "../../components/Seo/Seo";
import { ShareExportPanel } from "../../components/ShareExportPanel/ShareExportPanel";
import { UsernamePickerModal } from "../../components/UsernamePickerModal/UsernamePickerModal";
import { useKeyboardShortcutSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { AnalysisEngineExplorerPanels } from "../../features/analysisWorkspace/AnalysisEngineExplorerPanels";
import { AnalysisToolbar } from "../../features/analysisWorkspace/AnalysisToolbar";
import {
  AnalysisWorkspaceLayout,
  AnalysisWorkspacePanel,
} from "../../features/analysisWorkspace/AnalysisWorkspaceLayout";
import { AtomicDbAnalysisBlock } from "../../features/analysisWorkspace/AtomicDbAnalysisBlock";
import {
  OpeningExplorerCompactHeader,
  OpeningExplorerPanel,
  OpeningExplorerResizeHandle,
} from "../../features/analysisWorkspace/OpeningExplorerPanel";
import {
  PuzzleComposer,
  type PuzzleCreationResult,
} from "../../features/analysisWorkspace/PuzzleComposer";
import {
  useBoardAlignedPanelHeight,
  useOpeningExplorerSplit,
} from "../../features/analysisWorkspace/useAnalysisWorkspaceLayout";
import { useAtomicDbAnalysis } from "../../hooks/useAtomicDbAnalysis";
import { useAtomicDbBoardAnalysis } from "../../hooks/useAtomicDbBoardAnalysis";
import { useAtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { useBoardDocument } from "../../hooks/useBoardDocument";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { type OpeningExplorerRequest, useOpeningExplorer } from "../../hooks/useOpeningExplorer";
import { readPersistedState, usePersistedState } from "../../hooks/usePersistedState";
import { useUsernamePicker } from "../../hooks/useUsernamePicker";
import { buildBoardLoadNavigation } from "../../lib/analysis/boardLoading";
import {
  boardLineAnnotationNavigation,
  boardLineNavigation,
  getBoardMoveState,
} from "../../lib/analysis/boardState";
import { apiRequest } from "../../lib/api/postApi";
import { keyboardShortcutAction, keyboardShortcutHint } from "../../lib/keyboardShortcuts";
import { serializeSanLinesToPgn, startingPlyFromFen } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import { ATOMIC_DB_HOME_URL, atomicDbPositionUrl } from "../../utils/atomicDb";
import { selectSpacebarMove } from "../../utils/boardMoveSelection";
import { setBrowserStorageJson } from "../../utils/browserStorage";
import { getErrorMessage } from "../../utils/errors";
import { formatGameCount } from "../../utils/formatters";
import { lichessAtomicAnalysisUrl } from "../../utils/lichess";
import {
  buildOpeningExplorerUrl,
  fetchExplorerApiResponse,
  mergeExplorerApiResponses,
} from "../../utils/openingExplorer";
import { practicePath, practiceRouteParam, practiceUsernamesFromRoute } from "./practiceRoutes";
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

const randomOpeningPlayerSchema = z.object({ username: z.string().trim().min(1) });

const PRACTICE_AUTOMOVE_MIN_THINK_MS = 240;
const PLAYER_MIN_RATING = 1700;
const MOVES_OPEN_STORAGE_KEY = "atomic-puzzles.practice.moves-open";
const PRACTICE_BOARD_STORAGE_KEY = "atomic-puzzles.practice.board";
const practiceBoardSchema = z.object({
  fen: z.string().min(1),
  pgn: z.string(),
  line: z.number().int().nonnegative(),
  ply: z.number().int().nonnegative(),
});
const buildPracticePgn = (rootFen: string, moveText = ""): string =>
  [
    '[Variant "Atomic"]',
    '[SetUp "1"]',
    `[FEN "${rootFen}"]`,
    ...(moveText ? ["", moveText] : []),
  ].join("\n");
type PracticeMove = OpeningDatabaseMove;

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
  const auth = useAuth();
  const publishesDirectly = isApprovedPuzzleCreator(auth.user?.username ?? "");
  const puzzleActionLabel = publishesDirectly ? "Create puzzle" : "Submit puzzle";
  const keyboardShortcuts = useKeyboardShortcutSettings();
  const pauseShortcutHint = keyboardShortcutHint(keyboardShortcuts, "pausePractice");
  const explorerShortcutHint = keyboardShortcutHint(keyboardShortcuts, "toggleExplorer");
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const routeOpponents =
    typeof routeParams.opponents === "string" ? routeParams.opponents : undefined;
  const routeOpponentUsernames = useMemo(
    () => practiceUsernamesFromRoute(routeOpponents),
    [routeOpponents],
  );
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
    showPerformance,
    clockMinutes,
    clockIncrementSeconds,
    clockEnabled,
  } = settings;
  const routeInitializedRef = useRef(false);
  const previousRouteOpponentsRef = useRef(routeOpponents);
  const navigateToPracticeOpponents = useCallback(
    (usernames: string[], replace = false): void => {
      void navigate({
        to: "/practice/{-$opponents}",
        params: { opponents: practiceRouteParam(usernames) },
        replace,
      });
    },
    [navigate],
  );
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const lowerClockRef = useRef<HTMLDivElement | null>(null);
  const practicePanelRef = useRef<HTMLElement | null>(null);
  const movePanelRef = useRef<HTMLDivElement | null>(null);
  const remainingClockMsRef = useRef(clockMinutes * 60_000);
  const lastAutoFenRef = useRef("");
  const triedMoveUcisByFenRef = useRef<Map<string, Set<string>>>(new Map());
  const [restoredBoard] = useState(() =>
    readPersistedState(PRACTICE_BOARD_STORAGE_KEY, practiceBoardSchema),
  );
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [practiceRootFen, setPracticeRootFen] = useState(restoredBoard?.fen ?? STARTING_FEN);
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(() =>
    restoredBoard ? buildBoardLoadNavigation(restoredBoard) : null,
  );
  const navigationRef = useRef(navigation);
  const [puzzleDraft, setPuzzleDraft] = useState<{
    fen: string;
    orientation: "white" | "black";
    sourcePly: number;
  } | null>(null);
  const [draftBoardState, setDraftBoardState] = useState<ChessboardState | null>(null);
  const [draftNavigation, setDraftNavigation] = useState<SolutionNavigation | null>(null);
  const [createdPuzzle, setCreatedPuzzle] = useState<PuzzleCreationResult | null>(null);
  const puzzleLauncher = useRef<HTMLButtonElement | null>(null);
  const practiceScrollTop = useRef(0);
  const [pendingAutoMove, setPendingAutoMove] = useState<PendingAutoMove | null>(null);
  const {
    isOpen: usernamePickerOpen,
    recentUsernames,
    open: openPicker,
    close: closeUsernamePicker,
    remember: rememberUsername,
    removeRecent: removeRecentUsername,
  } = useUsernamePicker("player");
  const [exhaustedFen, setExhaustedFen] = useState<string | null>(null);
  const [movesOpen, setMovesOpen] = usePersistedState(MOVES_OPEN_STORAGE_KEY, z.boolean(), true);
  const explorerOpen = !puzzleDraft && !movesOpen;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const alignedPanelHeight = useBoardAlignedPanelHeight(
    practicePanelRef,
    boardPanelRef,
    lowerClockRef,
    clockEnabled,
  );
  const {
    movePanelHeight,
    resizing: explorerResizing,
    separatorProps,
  } = useOpeningExplorerSplit({
    scope: "practice",
    enabled: explorerOpen,
    panelRef: practicePanelRef,
    movePanelRef,
    defaultPercent: 60,
  });
  const [hoveredMoveUci, setHoveredMoveUci] = useState<string | null>(null);
  const [randomPlayerLoading, setRandomPlayerLoading] = useState(false);
  const [randomPlayerError, setRandomPlayerError] = useState("");
  const [dismissedError, setDismissedError] = useState("");
  const [remainingClockMs, setRemainingClockMs] = useState(clockMinutes * 60_000);
  const [clockExpired, setClockExpired] = useState(false);
  const [gamePaused, setGamePaused] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);

  const {
    canStepBack,
    canStepForward,
    currentFen,
    currentPly,
    activeLineIndex,
    lineTargets,
    lines: analysisLines,
    moveList,
    terminalOutcome,
  } = getBoardMoveState(boardState, practiceRootFen);
  const draftBoard = getBoardMoveState(draftBoardState, puzzleDraft?.fen ?? currentFen);
  const analysisFen = puzzleDraft ? draftBoard.currentFen : currentFen;
  const {
    analysis: atomicDbAnalysis,
    engineMoves,
    beginVariationPlayback,
    fen: atomicDbFen,
    finishVariationPlayback,
    variationPlaying: atomicDbLinePlaying,
  } = useAtomicDbBoardAnalysis({
    currentFen: analysisFen,
    enabled: atomicDbEngineSettings.enabled,
    atomicDbEnabled: atomicDbEngineSettings.atomicDbEnabled !== false,
    navigation: puzzleDraft ? draftNavigation : navigation,
    lineCount: atomicDbEngineSettings.lineCount,
    showFollowUpMoves: atomicDbEngineSettings.showFollowUpMoves,
    terminalOutcome: puzzleDraft ? draftBoard.terminalOutcome : terminalOutcome,
  });
  const currentLichessAnalysisUrl = lichessAtomicAnalysisUrl(analysisFen);
  const currentTurn = boardState?.turn || "white";
  const gameFinished = terminalOutcome !== null;
  const opponentSide = oppositeSide(side);
  const canUsePlayerSource = opponentSource === "general" || opponentUsernames.length > 0;
  const practiceExplorerCacheKey = useMemo(
    () =>
      JSON.stringify({
        fen: currentFen,
        opponentSource,
        opponentUsernames,
        opponentSide,
        playerContinuation,
      }),
    [currentFen, opponentSide, opponentSource, opponentUsernames, playerContinuation],
  );
  const requestExplorer = useCallback(
    (signal: AbortSignal) => {
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
    showPerformance: opponentSource === "player" && showPerformance,
    request: requestExplorer,
    cacheKey: practiceExplorerCacheKey,
  });
  const databaseExhausted = exhaustedFen === currentFen;
  const engineFallbackReady = databaseExhausted && status === "ready";
  const engineMoveLineCount = Math.min(
    5,
    (triedMoveUcisByFenRef.current.get(currentFen)?.size ?? 0) + 1,
  );
  const engineMoveAnalysis = useAtomicDbAnalysis(currentFen, {
    enabled:
      engineFallbackReady &&
      currentTurn === opponentSide &&
      !gamePaused &&
      navigation === null &&
      lastAutoFenRef.current !== currentFen,
    debounceMs: 0,
    lineCount: engineMoveLineCount,
    plyCount: 1,
    fallbackToEngine: true,
  });
  const popupError =
    (status === "error" ? "Could not load database moves. Try again." : "") ||
    (engineMoveAnalysis.status === "error" ? engineMoveAnalysis.error : "") ||
    randomPlayerError;
  const visiblePopupError = popupError && popupError !== dismissedError ? popupError : "";

  useEffect(() => {
    if (!popupError) setDismissedError("");
  }, [popupError]);

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
  const practiceMoveText = serializeSanLinesToPgn(practiceRootFen, analysisLines);
  const currentPracticePgn = buildPracticePgn(practiceRootFen, practiceMoveText);
  const draftMoveText = puzzleDraft
    ? serializeSanLinesToPgn(puzzleDraft.fen, draftBoard.lines)
    : "";

  useEffect(() => {
    if (!boardState || navigation || boardState.status === "Invalid PGN") return;
    setBrowserStorageJson("local", PRACTICE_BOARD_STORAGE_KEY, {
      fen: practiceRootFen,
      pgn: practiceMoveText,
      line: activeLineIndex,
      ply: currentPly,
    });
  }, [activeLineIndex, boardState, currentPly, navigation, practiceMoveText, practiceRootFen]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (puzzleDraft) {
      url.searchParams.set("puzzle", String(puzzleDraft.sourcePly));
      url.hash = `ply-${draftBoard.currentPly}`;
    } else if (url.searchParams.has("puzzle")) {
      url.searchParams.delete("puzzle");
      url.hash = "";
    }
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [draftBoard.currentPly, puzzleDraft]);
  const totalGames = practiceMoves.reduce((total, move) => total + move.games, 0);
  const canRunPractice =
    !puzzleDraft && canUsePlayerSource && !gameFinished && !(clockEnabled && clockExpired);
  const maxPracticePlayers = allowMultiplePlayers ? MAX_PRACTICE_PLAYERS : 1;
  const canAddPracticePlayer = opponentUsernames.length < maxPracticePlayers;
  const canChoosePracticePlayer = allowMultiplePlayers ? canAddPracticePlayer : true;

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
  }, [clearAutoMoveState, clearTriedMoves]);

  const resetPracticeClock = useCallback(
    (minutes = clockMinutes, pauseGame = true): void => {
      const nextMilliseconds = minutes * 60_000;
      remainingClockMsRef.current = nextMilliseconds;
      setRemainingClockMs((current) =>
        Math.ceil(current / 1000) === Math.ceil(nextMilliseconds / 1000) && nextMilliseconds > 0
          ? current
          : nextMilliseconds,
      );
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
    !databaseExhausted;

  useEffect(() => {
    if (!clockRunning) return;

    let lastTick = window.performance.now();
    const updateClock = (): void => {
      const now = window.performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      const nextMilliseconds = Math.max(0, remainingClockMsRef.current - elapsed);
      remainingClockMsRef.current = nextMilliseconds;
      setRemainingClockMs((displayedMilliseconds) =>
        Math.ceil(displayedMilliseconds / 1000) === Math.ceil(nextMilliseconds / 1000)
          ? displayedMilliseconds
          : nextMilliseconds,
      );
      if (nextMilliseconds <= 0) {
        setClockExpired(true);
        setGamePaused(true);
      }
    };
    const interval = window.setInterval(updateClock, 250);

    return () => {
      updateClock();
      window.clearInterval(interval);
    };
  }, [clockRunning]);

  useEffect(() => {
    if (
      !canUsePlayerSource ||
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
      // The selected player -> optional general database chain is complete. The shared AtomicDB
      // analysis path takes over from here and falls back to Atomic-Stockfish when necessary.
      setExhaustedFen(currentFen);
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
  }, [analysisFen]);

  useEffect(() => {
    if (
      !engineFallbackReady ||
      currentTurn !== opponentSide ||
      gamePaused ||
      navigation ||
      lastAutoFenRef.current === currentFen
    ) {
      return;
    }
    if (engineMoveAnalysis.status !== "ready" || engineMoveAnalysis.result?.fen !== currentFen) {
      return;
    }

    const excludedMoves = triedMoveUcisByFenRef.current.get(currentFen);
    const uci = engineMoveAnalysis.result.position?.moves.find(
      (move) => !excludedMoves?.has(move.uci),
    )?.uci;
    if (!uci) return;

    lastAutoFenRef.current = currentFen;
    setPendingAutoMove({ fen: currentFen, uci });
  }, [
    currentFen,
    currentTurn,
    engineFallbackReady,
    engineMoveAnalysis,
    gamePaused,
    navigation,
    opponentSide,
  ]);

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

  const playAtomicDbLine = useCallback(
    (ucis: string[]): void => {
      const firstMove = ucis[0];
      if (!firstMove) return;
      if (ucis.length === 1) {
        playPracticeMove(firstMove);
        return;
      }

      clearAutoMoveState();
      setHoveredMoveUci(null);
      setGamePaused(true);
      recordTriedMove(currentFen, firstMove);
      beginVariationPlayback();
      queueNavigation({ type: "line", ucis });
    },
    [
      beginVariationPlayback,
      clearAutoMoveState,
      currentFen,
      playPracticeMove,
      queueNavigation,
      recordTriedMove,
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
      if (puzzleDraft) {
        setDraftNavigation({ type: "command", command });
        return;
      }
      clearAutoMoveState();
      if (command === "previous" || command === "start") {
        setGamePaused(true);
      }
      queueNavigation({ type: "command", command });
    },
    [clearAutoMoveState, puzzleDraft, queueNavigation],
  );

  const navigateToPly = useCallback(
    (plyIndex: number): void => {
      clearAutoMoveState();
      if (plyIndex < currentPly) {
        setGamePaused(true);
      }
      queueNavigation({ type: "history", ply: plyIndex });
    },
    [clearAutoMoveState, currentPly, queueNavigation],
  );

  const navigateToAnalysisMove = useCallback(
    (lineIndex: number, moveIndex: number): void => {
      clearAutoMoveState();
      if (moveIndex + 1 < currentPly) setGamePaused(true);
      const target = lineTargets[lineIndex];
      if (target) queueNavigation(boardLineNavigation(target, moveIndex + 1));
    },
    [clearAutoMoveState, currentPly, lineTargets, queueNavigation],
  );

  const annotateMove = useCallback(
    (lineIndex: number | undefined, moveIndex: number, annotation: string): void => {
      const target =
        lineIndex === undefined ? { source: "history" as const } : lineTargets[lineIndex];
      if (!target) return;
      const nextNavigation = boardLineAnnotationNavigation(target, moveIndex + 1, annotation);
      if (nextNavigation) queueNavigation(nextNavigation);
    },
    [lineTargets, queueNavigation],
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

  const handleNavigationHandled = useCallback((): void => {
    const handledNavigation = navigationRef.current;
    if (handledNavigation?.type === "line") finishVariationPlayback();
    clearHandledNavigation(handledNavigation);
  }, [clearHandledNavigation, finishVariationPlayback]);

  useBoardWheelNavigation({
    boardPanelRef,
    canStepBack: puzzleDraft ? draftBoard.canStepBack : canStepBack,
    canStepForward: puzzleDraft ? draftBoard.canStepForward : canStepForward,
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

  const pauseForOpponentChange = useCallback((): void => {
    resetOpponentMoveChoices();
    setHoveredMoveUci(null);
    resetPracticeClock();
  }, [resetOpponentMoveChoices, resetPracticeClock]);

  useEffect(() => {
    if (!routeInitializedRef.current) {
      routeInitializedRef.current = true;
      previousRouteOpponentsRef.current = routeOpponents;

      if (routeOpponentUsernames.length > 0) {
        setSettings((current) => ({
          ...current,
          opponentSource: "player",
          opponentUsernames: routeOpponentUsernames,
          allowMultiplePlayers: routeOpponentUsernames.length > 1,
        }));
      } else if (opponentSource === "player" && opponentUsernames.length > 0) {
        navigateToPracticeOpponents(opponentUsernames, true);
      }
      return;
    }

    if (previousRouteOpponentsRef.current === routeOpponents) return;
    previousRouteOpponentsRef.current = routeOpponents;

    if (routeOpponentUsernames.length > 0) {
      setSettings((current) => ({
        ...current,
        opponentSource: "player",
        opponentUsernames: routeOpponentUsernames,
        allowMultiplePlayers: routeOpponentUsernames.length > 1,
      }));
    } else {
      updateSettings({ opponentSource: "general" });
    }
    pauseForOpponentChange();
  }, [
    navigateToPracticeOpponents,
    opponentSource,
    opponentUsernames,
    pauseForOpponentChange,
    routeOpponentUsernames,
    routeOpponents,
    setSettings,
    updateSettings,
  ]);

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
      queueNavigation(buildBoardLoadNavigation({ fen: nextFen }));
    },
    onCommitPgn: (draft, initialFen) => {
      const nextRootFen = initialFen ?? practiceRootFen;
      const imported = buildPgnHistory(nextRootFen, draft);
      if (!imported.ok) throw new Error(imported.error);
      if (practiceMoveText && imported.history.plies.length <= 1) {
        throw new Error("Use Start over to clear the practice PGN.");
      }
      resetOpponentMoveChoices();
      setHoveredMoveUci(null);
      resetPracticeClock();
      setSessionStarted(false);
      if (initialFen) setPracticeRootFen(initialFen);
      queueNavigation(buildBoardLoadNavigation({ fen: nextRootFen, pgn: draft }));
    },
  });

  const restartPracticeGame = (): void => {
    resetOpponentMoveChoices();
    setHoveredMoveUci(null);
    resetPracticeClock();
    setSessionStarted(false);
    boardDocument.resetDrafts(practiceRootFen, buildPracticePgn(practiceRootFen));
    queueNavigation(buildBoardLoadNavigation({ fen: practiceRootFen }));
  };

  const draftDocument = useBoardDocument({
    fen: puzzleDraft?.fen ?? "",
    pgn: draftMoveText,
    boardState: draftBoardState,
    onCommitFen: () => {},
    onCommitPgn: (pgn, initialFen) => {
      if (!puzzleDraft) return;
      if (initialFen && initialFen !== puzzleDraft.fen) {
        throw new Error("Keep the puzzle’s selected starting position.");
      }
      setDraftNavigation(buildBoardLoadNavigation({ fen: puzzleDraft.fen, pgn }));
    },
  });

  const startPuzzle = (event: MouseEvent<HTMLButtonElement>): void => {
    if (!boardState || gameFinished || navigation || puzzleDraft) return;
    puzzleLauncher.current = event.currentTarget;
    practiceScrollTop.current = window.scrollY;
    setGamePaused(true);
    clearAutoMoveState();
    setHoveredMoveUci(null);
    setCreatedPuzzle(null);
    setDraftBoardState(null);
    setPuzzleDraft({ fen: currentFen, orientation: currentTurn, sourcePly: currentPly });
  };

  const closePuzzle = (result?: PuzzleCreationResult): void => {
    setPuzzleDraft(null);
    setDraftNavigation(null);
    setDraftBoardState(null);
    setHoveredMoveUci(null);
    if (result) setCreatedPuzzle(result);
    requestAnimationFrame(() => {
      window.scrollTo({ top: practiceScrollTop.current, behavior: "instant" });
      puzzleLauncher.current?.focus({ preventScroll: true });
    });
  };

  const navigateToDraftMove = (line: number, index: number): void => {
    const target = draftBoard.lineTargets[line];
    if (target) setDraftNavigation(boardLineNavigation(target, index + 1));
  };

  const commitUsername = useCallback(
    (nextUsername: string): void => {
      const trimmedUsername = nextUsername.trim();
      if (!trimmedUsername) return;

      const nextUsernames = allowMultiplePlayers
        ? normalizePracticeUsernames([...opponentUsernames, trimmedUsername])
        : [trimmedUsername];

      setSettings((current) => ({
        ...current,
        opponentUsernames: nextUsernames,
        opponentSource: "player",
      }));
      navigateToPracticeOpponents(nextUsernames);
      pauseForOpponentChange();
      rememberUsername(trimmedUsername);

      if (!allowMultiplePlayers) {
        closeUsernamePicker();
      }
    },
    [
      allowMultiplePlayers,
      closeUsernamePicker,
      navigateToPracticeOpponents,
      opponentUsernames,
      rememberUsername,
      pauseForOpponentChange,
      setSettings,
    ],
  );

  const selectRandomPlayer = useCallback(async (): Promise<void> => {
    if (randomPlayerLoading || !canChoosePracticePlayer) return;

    setRandomPlayerLoading(true);
    setRandomPlayerError("");

    try {
      const data = await apiRequest("/api/opening-explorer?randomPlayer=1", {
        errorMessage: "Could not select a random player",
        invalidMessage: "No random player is available",
        schema: randomOpeningPlayerSchema,
        headers: { "X-Explorer-Intent": "visible" },
      });
      commitUsername(data.username);
    } catch (randomError) {
      setRandomPlayerError(getErrorMessage(randomError, "Could not select a random player"));
    } finally {
      setRandomPlayerLoading(false);
    }
  }, [canChoosePracticePlayer, commitUsername, randomPlayerLoading]);

  const clearSelectedPlayers = (): void => {
    updateSettings({ opponentUsernames: [], opponentSource: "player" });
    navigateToPracticeOpponents([]);
    resetOpponentMoveChoices();
  };

  const removeOpponentUsername = useCallback(
    (usernameToRemove: string): void => {
      const nextUsernames = opponentUsernames.filter(
        (username) => username.toLowerCase() !== usernameToRemove.toLowerCase(),
      );
      setSettings((current) => ({
        ...current,
        opponentUsernames: nextUsernames,
      }));
      navigateToPracticeOpponents(nextUsernames);
      resetOpponentMoveChoices();
    },
    [navigateToPracticeOpponents, opponentUsernames, resetOpponentMoveChoices, setSettings],
  );

  const updateAllowMultiplePlayers = (allowMultiple: boolean): void => {
    updateSettings({ allowMultiplePlayers: allowMultiple });
    resetOpponentMoveChoices();

    if (!allowMultiple) {
      navigateToPracticeOpponents(opponentUsernames.slice(0, 1));
      setSettings((current) => ({
        ...current,
        opponentUsernames: current.opponentUsernames.slice(0, 1),
      }));
    }
  };

  const showGeneralOpponent = (): void => {
    updateSettings({ opponentSource: "general" });
    navigateToPracticeOpponents([]);
    resetOpponentMoveChoices();
  };

  const showPlayerOpponent = (): void => {
    updateSettings({ opponentSource: "player" });
    navigateToPracticeOpponents(opponentUsernames);
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
      const action = keyboardShortcutAction(event, keyboardShortcuts);
      const shortcutIndex = shortcutIndexFromKeyboardEvent(event, keyboardShortcuts);
      const isSpacebarShortcut = action === "playBestMove";
      const isMoveShortcut = shortcutIndex !== null && !isSpacebarShortcut;
      if (
        puzzleDraft ||
        usernamePickerOpen ||
        !action ||
        event.defaultPrevented ||
        (![
          "pausePractice",
          "toggleExplorer",
          "flipBoard",
          "toggleFollowUps",
          "alternatePracticeMove",
        ].includes(action) &&
          !isSpacebarShortcut &&
          !isMoveShortcut)
      )
        return;

      if (isTextEntryTarget(event.target)) return;

      if (isSpacebarShortcut) {
        // Reserve the playback shortcut even when no move is available.
        event.preventDefault();
        if (settingsOpen) return;

        const move = selectSpacebarMove({
          engineEnabled: atomicDbEngineSettings.enabled,
          engineResult: atomicDbAnalysis.result,
          engineStatus: atomicDbAnalysis.status,
          databaseMoves: practiceMoves,
          databaseStatus: status,
          fen: currentFen,
        });
        if (!move) return;

        playPracticeMove(move);
        return;
      }

      if (isMoveShortcut) {
        if (movesOpen || settingsOpen || status !== "ready") return;

        const move = practiceMoves[shortcutIndex];
        if (!move) return;

        event.preventDefault();
        playPracticeMove(move.uci);
        return;
      }

      event.preventDefault();
      if (action === "toggleExplorer") {
        setMovesOpen((open) => !open);
        setSettingsOpen(false);
      } else if (action === "toggleFollowUps") {
        setAtomicDbEngineSettings((current) => ({
          ...current,
          showFollowUpMoves: !current.showFollowUpMoves,
        }));
      } else if (action === "pausePractice") {
        toggleGamePaused();
      } else if (action === "alternatePracticeMove") {
        requestAlternateAutoMove();
      } else {
        flipPracticeSide();
      }
    };

    window.addEventListener("keydown", handlePracticeShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handlePracticeShortcut, { capture: true });
  }, [
    atomicDbAnalysis.result,
    atomicDbAnalysis.status,
    atomicDbEngineSettings.enabled,
    currentFen,
    flipPracticeSide,
    movesOpen,
    playPracticeMove,
    practiceMoves,
    puzzleDraft,
    requestAlternateAutoMove,
    setAtomicDbEngineSettings,
    setMovesOpen,
    settingsOpen,
    status,
    toggleGamePaused,
    usernamePickerOpen,
    keyboardShortcuts,
  ]);

  const practiceSettingsContent = (
    <div className="analysisFilterPanel practiceSettingsPanel" id="practice-settings-panel">
      {opponentSource === "player" ? (
        <>
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
          <label className="analysisFilterCheckbox">
            <span>Show performance rating</span>
            <input
              type="checkbox"
              checked={showPerformance}
              onChange={(event) => updateSettings({ showPerformance: event.target.checked })}
            />
          </label>
        </>
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
              className={playerContinuation === "engine" ? "active" : ""}
              aria-pressed={playerContinuation === "engine"}
              onClick={() => {
                updateSettings({ playerContinuation: "engine" });
                resetOpponentMoveChoices();
              }}
            >
              <FontAwesomeIcon icon={faRobot} />
              <span>Engine</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const practiceOpeningExplorer = explorerOpen ? (
    <OpeningExplorerPanel
      className={`practiceMovesPanel ${settingsOpen ? "settingsOpen" : ""}`}
      ariaLabel="Opening explorer"
      tableClassName="practiceMoveTableWrap"
      displayProps={
        settingsOpen
          ? undefined
          : {
              moves: practiceMoves,
              recentGames,
              status,
              error,
              emptyMessage:
                opponentSource === "player" && opponentUsernames.length === 0
                  ? "Choose a player or use the general database."
                  : "No database continuation.",
              showPerformance: opponentSource === "player" && showPerformance,
              orientation: side,
              currentPly,
              onPlayMove: playPracticeMove,
              onHoverMove: setHoveredMoveUci,
              showInlineError: false,
            }
      }
    >
      <OpeningExplorerResizeHandle {...separatorProps} />
      <section className="practiceSettings" aria-label="Opponent settings">
        <OpeningExplorerCompactHeader
          controlsId="practice-settings-panel"
          settingsOpen={settingsOpen}
          settingsTitle="Practice settings"
          tabListLabel="Opponent source"
          onSettingsToggle={() => setSettingsOpen((open) => !open)}
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
            title={`${selectedPlayerSummary} as ${opponentSide}`}
            onClick={showPlayerOpponent}
          >
            <span className="analysisExplorerPlayerLabel">
              <span>{selectedPlayerTabLabel}</span>
              <small>{selectedPlayerTabDetail}</small>
            </span>
          </button>
        </OpeningExplorerCompactHeader>
        {settingsOpen ? practiceSettingsContent : null}
      </section>
    </OpeningExplorerPanel>
  ) : null;

  const pageStyle = {
    "--analysis-board-size": "min(516px, calc(100dvh - var(--nav-height) - 44px))",
  } as CSSProperties;

  return (
    <AnalysisWorkspaceLayout className="practicePage" style={pageStyle}>
      <Seo
        title={
          opponentSource === "player" && opponentUsernames.length === 1
            ? `Practice against ${opponentUsernames[0]}`
            : "Opening Database Practice"
        }
        description={
          opponentSource === "player" && opponentUsernames.length === 1
            ? `Practice atomic openings against games played by ${opponentUsernames[0]}.`
            : "Practice atomic openings against the general database or selected players' games."
        }
        path={opponentSource === "player" ? practicePath(opponentUsernames) : "/practice"}
      />

      <AnalysisWorkspacePanel
        ref={practicePanelRef}
        className={`practicePanel ${puzzleDraft ? "puzzleDraftOpen" : ""} ${explorerOpen ? "explorerOpen" : "explorerCollapsed"} ${movePanelHeight !== null ? "customExplorerSplit" : ""} ${movePanelHeight === 0 ? "movesCollapsed" : ""} ${explorerResizing ? "explorerResizing" : ""}`}
        style={
          {
            ...(alignedPanelHeight === null
              ? {}
              : {
                  "--analysis-side-panel-height": `${alignedPanelHeight}px`,
                  "--analysis-side-panel-max-height": `${alignedPanelHeight}px`,
                }),
            ...(movePanelHeight === null
              ? {}
              : {
                  "--practice-move-panel-height": `${movePanelHeight}px`,
                }),
          } as CSSProperties
        }
        aria-label="Practice controls"
      >
        <div className="practiceSessionControls" role="group" aria-label="Practice session">
          <div className="practiceHeaderTitle">
            <h1>Opening Database Practice</h1>
          </div>
          <div className="practiceStatus" aria-live="polite">
            <strong>{totalGames ? `${formatGameCount(totalGames)} games` : "0 games"}</strong>
          </div>

          <div className="practiceClockActions" role="group" aria-label="Practice controls">
            <button
              type="button"
              onClick={toggleGamePaused}
              disabled={!canRunPractice}
              aria-label={
                gamePaused ? (sessionStarted ? "Resume game" : "Start game") : "Pause game"
              }
              title={`${gamePaused ? "Start or resume game" : "Pause game"}${pauseShortcutHint ? ` (${pauseShortcutHint})` : ""}`}
            >
              <FontAwesomeIcon icon={gamePaused ? faPlay : faPause} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={restartPracticeGame}
              disabled={Boolean(puzzleDraft)}
              aria-label="Start over"
              title="Start over from the initial position"
            >
              <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
            </button>
            <span className="practiceActionTooltip" data-tooltip="Practice random opponent">
              <button
                type="button"
                className="practiceRandomBoppButton"
                onClick={selectRandomPlayer}
                disabled={Boolean(puzzleDraft) || randomPlayerLoading || !canChoosePracticePlayer}
                aria-label="Practice a random opponent"
              >
                <FontAwesomeIcon icon={faDice} />
              </button>
            </span>
            {auth.isAuthenticated ? (
              <span className="practiceActionTooltip" data-tooltip={puzzleActionLabel}>
                <button
                  type="button"
                  onClick={startPuzzle}
                  disabled={Boolean(puzzleDraft || navigation) || !boardState || gameFinished}
                  aria-label={puzzleActionLabel}
                >
                  <FontAwesomeIcon icon={faPuzzlePiece} aria-hidden="true" />
                </button>
              </span>
            ) : null}
            <span className="practiceActionTooltip" data-tooltip="Swap opponent’s move">
              <button
                type="button"
                className="practiceAlternateMoveButton"
                onClick={requestAlternateAutoMove}
                disabled={Boolean(puzzleDraft) || status !== "ready"}
                aria-label="Choose a different opponent move"
              >
                <FontAwesomeIcon icon={faShuffle} />
              </button>
            </span>
          </div>
          {createdPuzzle ? (
            <p className="practicePuzzleConfirmation" role="status">
              {createdPuzzle.destination === "published" ? (
                <>
                  Puzzle created.{" "}
                  <Link to="/solve/$puzzleId" params={{ puzzleId: String(createdPuzzle.puzzleId) }}>
                    View puzzle
                  </Link>
                </>
              ) : (
                "Puzzle submitted for review."
              )}
            </p>
          ) : null}
        </div>

        <AnalysisEngineExplorerPanels
          movePanelRef={movePanelRef}
          movePanelAriaLabel="Position analysis and played moves"
          movePanelClassName="practicePlayedMovesPanel"
          engine={
            <AtomicDbAnalysisBlock
              fen={atomicDbFen}
              analysis={atomicDbAnalysis}
              settings={atomicDbEngineSettings}
              setSettings={setAtomicDbEngineSettings}
              onDisable={() => setHoveredMoveUci(null)}
              onFlipBoard={() => {
                if (!puzzleDraft) flipPracticeSide();
                else
                  setPuzzleDraft({
                    ...puzzleDraft,
                    orientation: oppositeSide(puzzleDraft.orientation),
                  });
              }}
              onPlayLine={(ucis) => {
                if (!puzzleDraft) playAtomicDbLine(ucis);
                else {
                  beginVariationPlayback();
                  setDraftNavigation({ type: "line", ucis });
                }
              }}
              onHoverMove={setHoveredMoveUci}
              disabled={atomicDbLinePlaying}
            />
          }
          moveContent={
            puzzleDraft ? (
              <PuzzleComposer
                publishesDirectly={publishesDirectly}
                fen={puzzleDraft.fen}
                solution={draftNavigation || draftDocument.pgn.error ? "" : draftMoveText}
                onCancel={() => closePuzzle()}
                onAdded={closePuzzle}
              >
                <MoveNotation
                  lines={draftBoard.lines}
                  moves={draftBoard.moveList}
                  currentPly={draftBoard.currentPly}
                  initialPly={startingPlyFromFen(puzzleDraft.fen)}
                  pinnedLineIndex={draftBoard.activeLineIndex}
                  inline
                  onNavigate={(ply) => setDraftNavigation({ type: "history", ply })}
                  onSelectVariation={navigateToDraftMove}
                />
                <AnalysisContinuationChoices
                  lines={draftBoard.lines}
                  moves={draftBoard.moveList}
                  currentPly={draftBoard.currentPly}
                  initialPly={startingPlyFromFen(puzzleDraft.fen)}
                  pinnedLineIndex={draftBoard.activeLineIndex}
                  onSelect={navigateToDraftMove}
                />
              </PuzzleComposer>
            ) : (
              <MoveNotation
                lines={analysisLines}
                moves={moveList}
                currentPly={currentPly}
                pinnedLineIndex={activeLineIndex}
                inline
                onNavigate={navigateToPly}
                onSelectVariation={navigateToAnalysisMove}
                onAnnotate={annotateMove}
              />
            )
          }
          explorer={practiceOpeningExplorer}
          continuationChoices={
            puzzleDraft ? null : (
              <AnalysisContinuationChoices
                lines={analysisLines}
                moves={moveList}
                currentPly={currentPly}
                pinnedLineIndex={activeLineIndex}
                onSelect={navigateToAnalysisMove}
              />
            )
          }
        />

        <AnalysisToolbar
          active={explorerOpen}
          ariaLabel="Practice navigation"
          canStepBack={puzzleDraft ? draftBoard.canStepBack : canStepBack}
          canStepForward={puzzleDraft ? draftBoard.canStepForward : canStepForward}
          className="practiceToolbar"
          onNavigate={requestNavigation}
          toggleDisabled={Boolean(puzzleDraft)}
          onToggle={() => {
            setSettingsOpen(false);
            setMovesOpen((open) => !open);
          }}
          toggleAriaLabel={movesOpen ? "Show database moves" : "Hide database moves"}
          toggleTitle={`${movesOpen ? "Show database moves" : "Hide database moves"}${explorerShortcutHint ? ` (${explorerShortcutHint})` : ""}`}
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
          premoveColor: side,
          premovesEnabled:
            sessionStarted && !gamePaused && !gameFinished && !(clockEnabled && clockExpired),
          captureNavigationShortcuts: true,
          solutionNavigation: puzzleDraft ? null : navigation,
          previewMove: hoveredMoveUci,
          engineMoves,
          onNavigateHandled: handleNavigationHandled,
          onStateChange: handleBoardStateChange,
        }}
        draftChessboardProps={
          puzzleDraft
            ? {
                puzzleId: "practice-puzzle-draft",
                fen: puzzleDraft.fen,
                orientation: puzzleDraft.orientation,
                coordinates: true,
                solution: "",
                showSolution: false,
                analysisMode: true,
                captureNavigationShortcuts: true,
                solutionNavigation: draftNavigation,
                previewMove: hoveredMoveUci,
                engineMoves,
                onNavigateHandled: () => {
                  finishVariationPlayback();
                  setDraftNavigation(null);
                },
                onStateChange: setDraftBoardState,
              }
            : undefined
        }
        boardOverlay={
          <AtomicDbEvalBar
            fen={atomicDbFen}
            analysis={atomicDbAnalysis}
            enabled={atomicDbEngineSettings.enabled}
            orientation={puzzleDraft?.orientation ?? side}
          />
        }
        boardAfter={
          <>
            {clockEnabled ? (
              <BoardClock
                rowRef={lowerClockRef}
                value={formatClockTime(remainingClockMs)}
                ariaLabel={`Your clock: ${formatClockTime(remainingClockMs)}`}
                active={clockRunning}
                expired={clockExpired}
              />
            ) : null}
            <ShareExportPanel
              className="practiceShareExport"
              title="Share & export"
              document={
                puzzleDraft
                  ? { ...draftDocument, fen: { value: puzzleDraft.fen, readOnly: true, error: "" } }
                  : practiceMoveText
                    ? { ...boardDocument, fen: { value: currentFen, readOnly: true, error: "" } }
                    : boardDocument
              }
              fileName={puzzleDraft ? "atomic-puzzle.pgn" : "atomic-practice.pgn"}
              actions={
                <>
                  <a href={currentLichessAnalysisUrl} target="_blank" rel="noreferrer">
                    View on Lichess
                  </a>
                  <a
                    href={
                      atomicDbAnalysis.result?.position?.key
                        ? atomicDbPositionUrl(atomicDbAnalysis.result.position.key)
                        : ATOMIC_DB_HOME_URL
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on AtomicDB
                  </a>
                </>
              }
            />
          </>
        }
        lichessHref={currentLichessAnalysisUrl}
        atomicDbHref={
          atomicDbAnalysis.result?.position?.key
            ? atomicDbPositionUrl(atomicDbAnalysis.result.position.key)
            : ATOMIC_DB_HOME_URL
        }
        document={boardDocument}
        showActions={false}
        showDocument={false}
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
