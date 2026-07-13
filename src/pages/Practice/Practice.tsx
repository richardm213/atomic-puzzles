import "../Analysis/Analysis.css";
import "./Practice.css";

import {
  faArrowsRotate,
  faBookOpen,
  faCheck,
  faDice,
  faGear,
  faRobot,
  faShuffle,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import {
  OpeningDatabaseDisplay,
  type OpeningDatabaseGame,
  type OpeningDatabaseMove,
} from "../../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";
import { PlaybackButtons } from "../../components/PlaybackButtons/PlaybackButtons";
import { PlayedMoves } from "../../components/PlayedMoves/PlayedMoves";
import { Seo } from "../../components/Seo/Seo";
import { UsernamePickerModal } from "../../components/UsernamePickerModal/UsernamePickerModal";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { findFairyStockfishMove } from "../../lib/practice/fairyStockfish";
import { createAtomicPosition, movePrefix } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatGameCount } from "../../utils/formatters";
import { lichessAtomicAnalysisUrl } from "../../utils/lichess";
import { toOpeningDatabaseGame, toOpeningDatabaseMove } from "../../utils/openingDatabaseDisplay";
import {
  type ExplorerApiResponse,
  fetchExplorerApiResponse,
  mergeExplorerApiResponses,
} from "../../utils/openingExplorer";
import {
  addRecentUsername,
  loadRecentUsernames,
  removeRecentUsername as removeRecentUsernameFromList,
  storeRecentUsernames,
} from "../../utils/recentUsernames";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const EXPLORER_REQUEST_TIMEOUT_MS = 15_000;
const PRACTICE_AUTOMOVE_MIN_THINK_MS = 520;
const PLAYER_MIN_RATING = 1700;
const PRACTICE_SETTINGS_STORAGE_KEY = "atomic-puzzles.practice.settings";
const MAX_PRACTICE_PLAYERS = 8;
const DEFAULT_CLOCK_MINUTES = 3;
const DEFAULT_CLOCK_INCREMENT_SECONDS = 0;
type PracticeMove = OpeningDatabaseMove;

type PracticeGame = OpeningDatabaseGame;

type PracticeStatus = "idle" | "loading" | "ready" | "error";
type PracticeEngineStatus = "idle" | "thinking" | "error";
type PracticeSide = "white" | "black";
type OpponentMode = "frequency" | "random" | "popular";
type OpponentSource = "general" | "player";
type PendingAutoMove = {
  fen: string;
  uci: string;
};
type PracticeExplorerResult = {
  response: ExplorerApiResponse;
  source: OpponentSource;
  usedGeneralFallback: boolean;
};

type StoredPracticeSettings = {
  side: PracticeSide;
  opponentMode: OpponentMode;
  opponentSource: OpponentSource;
  opponentUsernames: string[];
  opponentUsername?: string;
  allowMultiplePlayers: boolean;
  continueWithGeneralDb: boolean;
  clockMinutes: number;
  clockIncrementSeconds: number;
  clockEnabled: boolean;
  engineEnabled: boolean;
};

const DEFAULT_SETTINGS: StoredPracticeSettings = {
  side: "white",
  opponentMode: "frequency",
  opponentSource: "general",
  opponentUsernames: [],
  allowMultiplePlayers: false,
  continueWithGeneralDb: false,
  clockMinutes: DEFAULT_CLOCK_MINUTES,
  clockIncrementSeconds: DEFAULT_CLOCK_INCREMENT_SECONDS,
  clockEnabled: true,
  engineEnabled: true,
};

const normalizeClockValue = (value: unknown, fallback: number, maximum: number): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(numericValue)));
};

const formatClockTime = (milliseconds: number): string => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const normalizePracticeUsernames = (value: unknown): string[] => {
  const usernames = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seenUsernames = new Set<string>();

  return usernames
    .map((username) => String(username).trim())
    .filter((username) => {
      if (!username) return false;

      const normalizedUsername = username.toLowerCase();
      if (seenUsernames.has(normalizedUsername)) return false;

      seenUsernames.add(normalizedUsername);
      return true;
    })
    .slice(0, MAX_PRACTICE_PLAYERS);
};

const loadPracticeSettings = (): StoredPracticeSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_SETTINGS;
    const value = parsed as Partial<StoredPracticeSettings>;
    const allowMultiplePlayers = value.allowMultiplePlayers === true;
    const opponentUsernames = normalizePracticeUsernames(
      value.opponentUsernames?.length ? value.opponentUsernames : value.opponentUsername,
    );

    return {
      side: value.side === "black" ? "black" : "white",
      opponentMode:
        value.opponentMode === "random" || value.opponentMode === "popular"
          ? value.opponentMode
          : "frequency",
      opponentSource: value.opponentSource === "player" ? "player" : "general",
      opponentUsernames: allowMultiplePlayers ? opponentUsernames : opponentUsernames.slice(0, 1),
      allowMultiplePlayers,
      continueWithGeneralDb: value.continueWithGeneralDb === true,
      clockMinutes: normalizeClockValue(value.clockMinutes, DEFAULT_CLOCK_MINUTES, 180),
      clockIncrementSeconds: normalizeClockValue(
        value.clockIncrementSeconds,
        DEFAULT_CLOCK_INCREMENT_SECONDS,
        60,
      ),
      clockEnabled: value.clockEnabled !== false,
      engineEnabled: value.engineEnabled !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const storePracticeSettings = (settings: StoredPracticeSettings): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(PRACTICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const oppositeSide = (side: PracticeSide): PracticeSide => (side === "white" ? "black" : "white");

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

const buildPracticeExplorerUrl = ({
  fen,
  opponentUsername = "",
  opponentSide,
}: {
  fen: string;
  opponentUsername?: string;
  opponentSide: PracticeSide;
}): string => {
  const params = new URLSearchParams({
    fen,
    speeds: "0,1",
  });

  const username = opponentUsername.trim();
  if (username) {
    params.set("username", username);
    params.set("color", opponentSide);
    params.set("minRating", String(PLAYER_MIN_RATING));
  }

  return `${appAssetPath("/api/opening-explorer")}?${params.toString()}`;
};

const fetchGeneralPracticeExplorerResponse = ({
  fen,
  opponentSide,
}: {
  fen: string;
  opponentSide: PracticeSide;
}): Promise<ExplorerApiResponse> =>
  fetchExplorerApiResponse(buildPracticeExplorerUrl({ fen, opponentSide }), "practice");

const fetchPracticeExplorerResponse = async ({
  fen,
  opponentSource,
  opponentUsernames,
  opponentSide,
  continueWithGeneralDb,
}: {
  fen: string;
  opponentSource: OpponentSource;
  opponentUsernames: string[];
  opponentSide: PracticeSide;
  continueWithGeneralDb: boolean;
}): Promise<PracticeExplorerResult> => {
  if (opponentSource === "general") {
    return {
      response: await fetchGeneralPracticeExplorerResponse({ fen, opponentSide }),
      source: "general",
      usedGeneralFallback: false,
    };
  }

  // Start the optional fallback alongside the player lookup. Positions outside a
  // player's repertoire otherwise pay for two full network/database round trips.
  const generalFallbackPromise = continueWithGeneralDb
    ? fetchGeneralPracticeExplorerResponse({ fen, opponentSide }).then(
        (response) => ({ response, error: null }),
        (error: unknown) => ({ response: null, error }),
      )
    : null;

  const playerResponse = await Promise.all(
    opponentUsernames.map((opponentUsername) =>
      fetchExplorerApiResponse(
        buildPracticeExplorerUrl({ fen, opponentUsername, opponentSide }),
        "practice",
      ),
    ),
  ).then(mergeExplorerApiResponses);

  if (continueWithGeneralDb && playerResponse.moves.length === 0) {
    const generalFallback = await generalFallbackPromise;
    if (!generalFallback?.response) throw generalFallback?.error;

    return {
      response: generalFallback.response,
      source: "general",
      usedGeneralFallback: true,
    };
  }

  return {
    response: playerResponse,
    source: "player",
    usedGeneralFallback: false,
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

const PracticeLichessIcon = () => (
  <svg viewBox="0 0 50 50" aria-hidden="true" focusable="false">
    <path
      d="M38.956.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084S-.506 27.392 4.683 17.567C9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z"
      fill="currentColor"
    />
  </svg>
);

export const PracticePage = () => {
  const [initialSettings] = useState(loadPracticeSettings);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const remainingClockMsRef = useRef(initialSettings.clockMinutes * 60_000);
  const seenRandomPlayersRef = useRef<Set<string>>(new Set());
  const randomPlayerPoolRef = useRef<string[] | null>(null);
  const lastAutoFenRef = useRef("");
  const navigationRef = useRef<SolutionNavigation | null>(null);
  const triedMoveUcisByFenRef = useRef<Map<string, Set<string>>>(new Map());
  const fenDraftDirtyRef = useRef(false);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [practiceRootFen, setPracticeRootFen] = useState(STARTING_FEN);
  const [fenDraft, setFenDraft] = useState(STARTING_FEN);
  const [fenError, setFenError] = useState("");
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [pendingAutoMove, setPendingAutoMove] = useState<PendingAutoMove | null>(null);
  const [side, setSide] = useState<PracticeSide>(initialSettings.side);
  const [opponentMode, setOpponentMode] = useState<OpponentMode>(initialSettings.opponentMode);
  const [opponentSource, setOpponentSource] = useState<OpponentSource>(
    initialSettings.opponentSource,
  );
  const [opponentUsernames, setOpponentUsernames] = useState<string[]>(
    initialSettings.opponentUsernames,
  );
  const [usernamePickerOpen, setUsernamePickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentUsernames, setRecentUsernames] = useState<string[]>(loadRecentUsernames);
  const [allowMultiplePlayers, setAllowMultiplePlayers] = useState(
    initialSettings.allowMultiplePlayers,
  );
  const [continueWithGeneralDb, setContinueWithGeneralDb] = useState(
    initialSettings.continueWithGeneralDb,
  );
  const [exhaustedFen, setExhaustedFen] = useState<string | null>(null);
  const [usingGeneralFallback, setUsingGeneralFallback] = useState(false);
  const [movesOpen, setMovesOpen] = useState(true);
  const [practiceMoves, setPracticeMoves] = useState<PracticeMove[]>([]);
  const [recentGames, setRecentGames] = useState<PracticeGame[]>([]);
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const [error, setError] = useState("");
  const [hoveredMoveUci, setHoveredMoveUci] = useState<string | null>(null);
  const [copyPgnLabel, setCopyPgnLabel] = useState("Copy PGN");
  const [randomPlayerLoading, setRandomPlayerLoading] = useState(false);
  const [randomPlayerError, setRandomPlayerError] = useState("");
  const [engineStatus, setEngineStatus] = useState<PracticeEngineStatus>("idle");
  const [engineError, setEngineError] = useState("");
  const [engineEnabled, setEngineEnabled] = useState(initialSettings.engineEnabled);
  const [clockMinutes, setClockMinutes] = useState(initialSettings.clockMinutes);
  const [clockIncrementSeconds, setClockIncrementSeconds] = useState(
    initialSettings.clockIncrementSeconds,
  );
  const [clockEnabled, setClockEnabled] = useState(initialSettings.clockEnabled);
  const [remainingClockMs, setRemainingClockMs] = useState(initialSettings.clockMinutes * 60_000);
  const [clockExpired, setClockExpired] = useState(false);
  const [gamePaused, setGamePaused] = useState(initialSettings.clockEnabled);

  const currentFen = boardState?.fen || STARTING_FEN;
  const databaseExhausted = exhaustedFen === currentFen;
  const useEngineForOpponentMove = engineEnabled || databaseExhausted;
  const currentLichessAnalysisUrl = lichessAtomicAnalysisUrl(currentFen);
  const currentTurn = boardState?.turn || "white";
  const opponentSide = oppositeSide(side);
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
    () =>
      [
        '[Variant "Atomic"]',
        '[SetUp "1"]',
        `[FEN "${practiceRootFen}"]`,
        '[Result "*"]',
        "",
        currentMoveText ? `${currentMoveText} *` : "*",
      ].join("\n"),
    [currentMoveText, practiceRootFen],
  );
  const canStepBack = currentPly > 0;
  const canStepForward = currentPly < moveList.length;
  const totalGames = practiceMoves.reduce((total, move) => total + move.games, 0);
  const canUsePlayerSource = opponentSource === "general" || opponentUsernames.length > 0;
  const maxPracticePlayers = allowMultiplePlayers ? MAX_PRACTICE_PLAYERS : 1;
  const canAddPracticePlayer = opponentUsernames.length < maxPracticePlayers;
  const canChoosePracticePlayer = allowMultiplePlayers ? canAddPracticePlayer : true;

  const handleCopyPgn = useCallback(async (): Promise<void> => {
    const copied = await copyTextToClipboard(currentPracticePgn);
    setCopyPgnLabel(copied ? "Copied" : "Copy failed");

    window.setTimeout(() => {
      setCopyPgnLabel("Copy PGN");
    }, 1800);
  }, [currentPracticePgn]);

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
    setUsingGeneralFallback(false);
  }, []);

  const resetOpponentMoveChoices = useCallback((): void => {
    clearAutoMoveState();
    clearTriedMoves();
  }, [clearAutoMoveState, clearTriedMoves]);

  useEffect(() => {
    storePracticeSettings({
      side,
      opponentMode,
      opponentSource,
      opponentUsernames,
      allowMultiplePlayers,
      continueWithGeneralDb,
      clockMinutes,
      clockIncrementSeconds,
      clockEnabled,
      engineEnabled,
    });
  }, [
    allowMultiplePlayers,
    continueWithGeneralDb,
    clockIncrementSeconds,
    clockEnabled,
    clockMinutes,
    engineEnabled,
    opponentMode,
    opponentSource,
    opponentUsernames,
    side,
  ]);

  const resetPracticeClock = useCallback(
    (minutes = clockMinutes): void => {
      const nextMilliseconds = minutes * 60_000;
      remainingClockMsRef.current = nextMilliseconds;
      setRemainingClockMs(nextMilliseconds);
      setClockExpired(nextMilliseconds <= 0);
      setGamePaused(true);
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
      setRemainingClockMs(nextMilliseconds);
      if (nextMilliseconds <= 0) setClockExpired(true);
    };
    const interval = window.setInterval(updateClock, 100);

    return () => {
      updateClock();
      window.clearInterval(interval);
    };
  }, [clockRunning]);

  useEffect(() => {
    if (!canUsePlayerSource) {
      setPracticeMoves([]);
      setRecentGames([]);
      setStatus("ready");
      setError("");
      setUsingGeneralFallback(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    let requestCancelled = false;
    let requestTimedOut = false;
    let autoMoveDelayTimeout: number | null = null;
    const requestStartedAt = window.performance.now();
    const requestTimeout = window.setTimeout(() => {
      requestTimedOut = true;
      if (!requestCancelled) {
        setPracticeMoves([]);
        setRecentGames([]);
        setStatus("error");
        setError("Opening explorer took too long to respond.");
      }
    }, EXPLORER_REQUEST_TIMEOUT_MS);

    setStatus("loading");
    setError("");
    setPracticeMoves([]);
    setRecentGames([]);
    setUsingGeneralFallback(false);

    fetchPracticeExplorerResponse({
      fen: currentFen,
      opponentSource,
      opponentUsernames,
      opponentSide,
      continueWithGeneralDb,
    })
      .then(({ response: data, usedGeneralFallback }) => {
        if (requestCancelled || requestTimedOut || requestId !== requestIdRef.current) return;

        const nextPracticeMoves = data.moves.map((move) =>
          toOpeningDatabaseMove(move, currentFen, {
            showPerformance: opponentSource === "player",
            playerColor: opponentSide,
          }),
        );

        setPracticeMoves(nextPracticeMoves);
        setRecentGames(data.recentGames.map((game) => toOpeningDatabaseGame(game, currentFen)));
        setUsingGeneralFallback(usedGeneralFallback);
        setStatus("ready");

        if (
          !engineEnabled &&
          !gamePaused &&
          currentTurn === opponentSide &&
          !databaseExhausted &&
          lastAutoFenRef.current !== currentFen
        ) {
          const autoMove = chooseOpponentMove(
            getUntriedMoves(currentFen, nextPracticeMoves),
            opponentMode,
          );
          if (!autoMove) {
            setExhaustedFen(currentFen);
            return;
          }

          lastAutoFenRef.current = currentFen;
          const elapsed = window.performance.now() - requestStartedAt;
          const remainingThinkTime = Math.max(0, PRACTICE_AUTOMOVE_MIN_THINK_MS - elapsed);
          const queueAutoMove = (): void => {
            if (requestCancelled || requestTimedOut || requestId !== requestIdRef.current) return;

            setPendingAutoMove({ fen: currentFen, uci: autoMove.uci });
          };

          if (remainingThinkTime > 0) {
            autoMoveDelayTimeout = window.setTimeout(queueAutoMove, remainingThinkTime);
          } else {
            queueAutoMove();
          }
        }
      })
      .catch((fetchError) => {
        if (requestCancelled || requestTimedOut) return;
        setPracticeMoves([]);
        setRecentGames([]);
        setUsingGeneralFallback(false);
        setStatus("error");
        setError(fetchError instanceof Error ? fetchError.message : "Opening explorer failed");
      })
      .finally(() => {
        window.clearTimeout(requestTimeout);
      });

    return () => {
      requestCancelled = true;
      window.clearTimeout(requestTimeout);
      if (autoMoveDelayTimeout !== null) {
        window.clearTimeout(autoMoveDelayTimeout);
      }
    };
  }, [
    canUsePlayerSource,
    continueWithGeneralDb,
    currentFen,
    currentTurn,
    databaseExhausted,
    engineEnabled,
    gamePaused,
    getUntriedMoves,
    opponentMode,
    opponentSide,
    opponentSource,
    opponentUsernames,
  ]);

  useEffect(() => {
    setHoveredMoveUci(null);
    setFenDraft(currentFen);
    setFenError("");
    fenDraftDirtyRef.current = false;
  }, [currentFen]);

  useEffect(() => {
    if (
      !useEngineForOpponentMove ||
      currentTurn !== opponentSide ||
      gamePaused ||
      navigation ||
      lastAutoFenRef.current === currentFen
    ) {
      if (!useEngineForOpponentMove || currentTurn !== opponentSide) {
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
  }, [currentFen, currentTurn, gamePaused, navigation, opponentSide, useEngineForOpponentMove]);

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
    if (gamePaused) {
      lastAutoFenRef.current = "";
      setGamePaused(false);
      return;
    }

    lastAutoFenRef.current = "";
    setPendingAutoMove(null);
    setGamePaused(true);
  }, [gamePaused]);

  const updateClockEnabled = useCallback(
    (enabled: boolean): void => {
      setClockEnabled(enabled);
      if (enabled) {
        resetPracticeClock();
        return;
      }

      setGamePaused(false);
      lastAutoFenRef.current = "";
    },
    [resetPracticeClock],
  );

  const requestNavigation = useCallback(
    (command: PlaybackCommand): void => {
      clearAutoMoveState();
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
    setSide((currentSide) => oppositeSide(currentSide));
  }, [resetOpponentMoveChoices, resetPracticeClock]);

  const saveRecentUsernames = useCallback((nextUsernames: string[]): void => {
    setRecentUsernames(nextUsernames);
    storeRecentUsernames(nextUsernames);
  }, []);

  const closeUsernamePicker = useCallback((): void => {
    setUsernamePickerOpen(false);
  }, []);

  const openUsernamePicker = useCallback((): void => {
    setOpponentSource("player");
    setUsernamePickerOpen(true);
  }, []);

  const resetBoardForOpponent = useCallback((): void => {
    resetOpponentMoveChoices();
    setHoveredMoveUci(null);
    resetPracticeClock();
    setPracticeRootFen(STARTING_FEN);
    queueNavigation({ type: "reset", fen: STARTING_FEN });
  }, [queueNavigation, resetOpponentMoveChoices, resetPracticeClock]);

  const loadPracticeFen = useCallback(
    (draft = fenDraft): void => {
      const nextFen = draft.trim();
      try {
        createAtomicPosition(nextFen);
      } catch (fenFailure) {
        setFenError(fenFailure instanceof Error ? fenFailure.message : "Invalid FEN");
        return;
      }

      resetOpponentMoveChoices();
      setHoveredMoveUci(null);
      resetPracticeClock();
      setPracticeRootFen(nextFen);
      setFenDraft(nextFen);
      setFenError("");
      fenDraftDirtyRef.current = false;
      queueNavigation({ type: "reset", fen: nextFen });
    },
    [fenDraft, queueNavigation, resetOpponentMoveChoices, resetPracticeClock],
  );

  const commitUsername = useCallback(
    (nextUsername: string): void => {
      const trimmedUsername = nextUsername.trim();
      if (!trimmedUsername) return;

      setOpponentUsernames((currentUsernames) =>
        allowMultiplePlayers
          ? normalizePracticeUsernames([...currentUsernames, trimmedUsername])
          : [trimmedUsername],
      );
      setOpponentSource("player");
      resetBoardForOpponent();
      saveRecentUsernames(addRecentUsername(recentUsernames, trimmedUsername));

      if (!allowMultiplePlayers) {
        closeUsernamePicker();
      }
    },
    [
      allowMultiplePlayers,
      closeUsernamePicker,
      recentUsernames,
      resetBoardForOpponent,
      saveRecentUsernames,
    ],
  );

  const selectRandomPlayer = useCallback(async (): Promise<void> => {
    if (randomPlayerLoading || !canChoosePracticePlayer) return;

    setRandomPlayerLoading(true);
    setRandomPlayerError("");

    try {
      opponentUsernames.forEach((username) =>
        seenRandomPlayersRef.current.add(username.toLowerCase()),
      );

      if (randomPlayerPoolRef.current === null) {
        const response = await fetch(`${appAssetPath("/api/opening-explorer")}?players=1`, {
          headers: { "X-Explorer-Intent": "visible" },
        });
        const data = (await response.json()) as { players?: string[]; error?: string };

        if (!response.ok) {
          throw new Error(data.error || "Could not select a random player");
        }

        randomPlayerPoolRef.current = (data.players ?? [])
          .map((username) => username.trim())
          .filter(Boolean);
      }

      const availablePlayers = randomPlayerPoolRef.current.filter(
        (username) => !seenRandomPlayersRef.current.has(username.toLowerCase()),
      );
      if (availablePlayers.length === 0) {
        throw new Error("No new random players are available");
      }

      const username =
        availablePlayers[Math.floor(Math.random() * availablePlayers.length)]?.trim() ?? "";
      seenRandomPlayersRef.current.add(username.toLowerCase());

      commitUsername(username);
    } catch (randomError) {
      setRandomPlayerError(
        randomError instanceof Error ? randomError.message : "Could not select a random player",
      );
    } finally {
      setRandomPlayerLoading(false);
    }
  }, [canChoosePracticePlayer, commitUsername, opponentUsernames, randomPlayerLoading]);

  const removeRecentUsername = useCallback(
    (usernameToRemove: string): void => {
      saveRecentUsernames(removeRecentUsernameFromList(recentUsernames, usernameToRemove));
    },
    [recentUsernames, saveRecentUsernames],
  );

  const clearSelectedPlayers = (): void => {
    setOpponentUsernames([]);
    setOpponentSource("player");
    resetOpponentMoveChoices();
  };

  const removeOpponentUsername = useCallback(
    (usernameToRemove: string): void => {
      setOpponentUsernames((currentUsernames) =>
        currentUsernames.filter(
          (username) => username.toLowerCase() !== usernameToRemove.toLowerCase(),
        ),
      );
      resetOpponentMoveChoices();
    },
    [resetOpponentMoveChoices],
  );

  const updateAllowMultiplePlayers = (allowMultiple: boolean): void => {
    setAllowMultiplePlayers(allowMultiple);
    resetOpponentMoveChoices();

    if (!allowMultiple) {
      setOpponentUsernames((currentUsernames) => currentUsernames.slice(0, 1));
    }
  };

  const showGeneralOpponent = (): void => {
    setOpponentSource("general");
    resetOpponentMoveChoices();
  };

  const showPlayerOpponent = (): void => {
    setOpponentSource("player");
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
      const shortcutIndex =
        key === " " || key === "spacebar"
          ? 0
          : /^[1-9]$/.test(key)
            ? Number(key) - 1
            : /^digit[1-9]$/.test(event.code.toLowerCase())
              ? Number(event.code.slice(-1)) - 1
              : /^numpad[1-9]$/.test(event.code.toLowerCase())
                ? Number(event.code.slice(-1)) - 1
                : null;
      const isMoveShortcut = shortcutIndex !== null;

      if (
        usernamePickerOpen ||
        (key !== "a" && key !== "e" && key !== "f" && key !== "q" && !isMoveShortcut) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
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
    settingsOpen,
    status,
    toggleGamePaused,
    usernamePickerOpen,
  ]);

  useEffect(() => {
    if (!usernamePickerOpen) return;

    const handlePickerShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeUsernamePicker();
      }
    };

    window.addEventListener("keydown", handlePickerShortcut);
    return () => window.removeEventListener("keydown", handlePickerShortcut);
  }, [closeUsernamePicker, usernamePickerOpen]);

  const statusText = (() => {
    if (boardState?.winner === "white") return "White wins";
    if (boardState?.winner === "black") return "Black wins";
    if (opponentSource === "player" && opponentUsernames.length === 0) return "Choose player";
    if (engineStatus === "thinking") return "Fairy-Stockfish is thinking";
    if (engineStatus === "error") return engineError;
    if (status === "loading") return "Loading database moves";
    if (status === "error") return error;
    if (usingGeneralFallback) return "Using general database";
    if (databaseExhausted) return "Database line ended";
    if (gamePaused) return "Paused";
    if (currentTurn === side) return `Your move as ${side}`;
    return `Database to move as ${opponentSide}`;
  })();

  const pageStyle = {
    "--analysis-board-size": "516px",
  } as CSSProperties;

  return (
    <section className="analysisPage practicePage" style={pageStyle}>
      <Seo
        title="Practice"
        description="Practice atomic openings against the general database or a selected player's games."
        path="/practice"
      />

      <aside
        className={`analysisPanel practicePanel ${settingsOpen ? "dbMovesCollapsed" : ""} ${clockEnabled ? "" : "clockDisabled"}`}
        aria-label="Practice controls"
      >
        <div className="practiceHeader">
          <div>
            <p className="analysisEyebrow">Practice</p>
            <h1>Play the database</h1>
          </div>
          <div className="practiceHeaderActions">
            <a
              className="practiceLichessButton"
              href={currentLichessAnalysisUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="View current position on Lichess"
              title="View on Lichess"
            >
              <PracticeLichessIcon />
            </a>
            <button
              type="button"
              className="practiceSideButton"
              data-side={side}
              aria-label={`Play as ${opponentSide}`}
              title="Switch sides"
              onClick={flipPracticeSide}
            >
              <span className="practiceSideColor" aria-hidden="true" />
              <span className="practiceSideCopy">
                <small>Playing as</small>
                <strong>{side}</strong>
              </span>
              <span className="practiceSideFlip" aria-hidden="true">
                <FontAwesomeIcon icon={faArrowsRotate} />
              </span>
            </button>
          </div>
        </div>

        <div className="practiceStatus" aria-live="polite">
          <span>{statusText}</span>
          <strong>{totalGames ? `${formatGameCount(totalGames)} games` : "0 games"}</strong>
        </div>

        {clockEnabled ? (
          <div
            className={`practiceClock ${clockRunning ? "running" : ""} ${clockExpired ? "expired" : ""}`}
            aria-label={`Your clock: ${formatClockTime(remainingClockMs)}`}
          >
            <div>
              <span>Your clock</span>
              <small>
                {clockMinutes}+{clockIncrementSeconds}
              </small>
            </div>
            <strong aria-live="off">{formatClockTime(remainingClockMs)}</strong>
            <button
              type="button"
              onClick={toggleGamePaused}
              disabled={clockExpired}
              title={gamePaused ? "Start or resume game (A)" : "Pause game (A)"}
            >
              {gamePaused
                ? remainingClockMs === clockMinutes * 60_000
                  ? "Start"
                  : "Resume"
                : "Pause"}
            </button>
            <button type="button" onClick={() => resetPracticeClock()}>
              Reset
            </button>
          </div>
        ) : null}

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
              <button
                type="button"
                className="practiceAlternateMoveButton"
                onClick={requestAlternateAutoMove}
                disabled={status !== "ready"}
                aria-label="Choose a different opponent move"
                title="Undo the opponent move and choose a different one (Q)"
              >
                <FontAwesomeIcon icon={faShuffle} />
              </button>
              <button
                type="button"
                className={`practiceAlternateMoveButton practiceEngineToggle ${engineEnabled ? "active" : ""}`}
                aria-label={engineEnabled ? "Disable engine moves" : "Enable engine moves"}
                aria-pressed={engineEnabled}
                title={
                  engineEnabled ? "Disable Fairy-Stockfish moves" : "Enable Fairy-Stockfish moves"
                }
                onClick={() => setEngineEnabled((enabled) => !enabled)}
              >
                <FontAwesomeIcon icon={faRobot} />
              </button>
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
                    <button
                      type="button"
                      className="practiceRandomPlayerButton"
                      onClick={selectRandomPlayer}
                      disabled={randomPlayerLoading || !canChoosePracticePlayer}
                      title="Select a random opening database player"
                    >
                      <FontAwesomeIcon icon={faDice} />
                      <span>{randomPlayerLoading ? "Choosing..." : "Random"}</span>
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
                  {randomPlayerError ? (
                    <small className="practiceRandomPlayerError" role="alert">
                      {randomPlayerError}
                    </small>
                  ) : null}
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
                    onClick={() => setOpponentMode("frequency")}
                  >
                    Frequency
                  </button>
                  <button
                    type="button"
                    className={opponentMode === "random" ? "active" : ""}
                    aria-pressed={opponentMode === "random"}
                    onClick={() => setOpponentMode("random")}
                  >
                    <FontAwesomeIcon icon={faShuffle} />
                    <span>Random</span>
                  </button>
                  <button
                    type="button"
                    className={opponentMode === "popular" ? "active" : ""}
                    aria-pressed={opponentMode === "popular"}
                    onClick={() => setOpponentMode("popular")}
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
                          setClockMinutes(nextMinutes);
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
                          setClockIncrementSeconds(normalizeClockValue(event.target.value, 0, 60))
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

              <label className="practiceCheckbox">
                <span>Continue with general DB</span>
                <input
                  type="checkbox"
                  checked={continueWithGeneralDb}
                  onChange={(event) => {
                    setContinueWithGeneralDb(event.target.checked);
                    resetOpponentMoveChoices();
                  }}
                />
              </label>
            </div>
          ) : null}
        </section>

        {movesOpen && !settingsOpen ? (
          <section className="analysisMovePanel practicePlayedMovesPanel" aria-label="Played moves">
            <div className="analysisSectionTitle">
              <span>Moves</span>
              <small>
                {currentPly}/{moveList.length}
              </small>
            </div>
            <PlayedMoves moves={moveList} currentPly={currentPly} onNavigate={navigateToPly} />
          </section>
        ) : null}

        {!movesOpen && !settingsOpen ? (
          <section className="practiceMovesPanel" aria-label="Database moves">
            <div className="analysisSectionTitle">
              <span>Database moves</span>
              <small>{opponentSide}</small>
            </div>
            <div className="practiceMoveTableWrap">
              <OpeningDatabaseDisplay
                moves={practiceMoves}
                recentGames={recentGames}
                status={status}
                error={error}
                emptyMessage={
                  opponentSource === "player" && opponentUsernames.length === 0
                    ? "Choose a player or use the general database."
                    : "No database continuation."
                }
                showPerformance={opponentSource === "player"}
                orientation={side}
                currentPly={currentPly}
                onPlayMove={playPracticeMove}
                onHoverMove={setHoveredMoveUci}
              />
            </div>
          </section>
        ) : null}

        <div className="analysisBottomToolbar practiceToolbar" aria-label="Practice navigation">
          <button
            type="button"
            className={`analysisToolbarButton ${!movesOpen && !settingsOpen ? "active" : ""}`}
            aria-label={movesOpen || settingsOpen ? "Show database moves" : "Show played moves"}
            title={movesOpen || settingsOpen ? "Show database moves (E)" : "Show played moves (E)"}
            aria-pressed={!movesOpen && !settingsOpen}
            onClick={() => {
              if (settingsOpen || movesOpen) {
                setSettingsOpen(false);
                setMovesOpen(false);
              } else {
                setMovesOpen(true);
              }
            }}
          >
            <FontAwesomeIcon icon={faBookOpen} />
          </button>
          <PlaybackButtons
            buttonClassName="analysisToolbarButton"
            canStart={canStepBack}
            canPrevious={canStepBack}
            canNext={canStepForward}
            canEnd={canStepForward}
            onNavigate={requestNavigation}
          />
        </div>
      </aside>

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

      <div className="analysisBoardColumn practiceBoardColumn">
        <div ref={boardPanelRef} className="analysisBoardPanel" aria-label="Atomic practice board">
          <Chessboard
            puzzleId="practice"
            fen={practiceRootFen}
            orientation={side}
            coordinates
            solution=""
            showSolution={false}
            analysisMode
            captureNavigationShortcuts
            solutionNavigation={navigation}
            previewMove={hoveredMoveUci}
            onNavigateHandled={() => {
              const handledNavigation = navigation;
              clearHandledNavigation(handledNavigation);
            }}
            onStateChange={handleBoardStateChange}
          />
        </div>
        <div className="analysisBoardTextPanel">
          <div className="analysisFenBox analysisTextBox">
            <span>FEN</span>
            <textarea
              value={fenDraft}
              rows={2}
              spellCheck={false}
              aria-label="FEN"
              aria-invalid={Boolean(fenError)}
              onFocus={() => {
                fenDraftDirtyRef.current = false;
              }}
              onBlur={(event) => {
                if (fenDraftDirtyRef.current) loadPracticeFen(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                loadPracticeFen(event.currentTarget.value);
              }}
              onChange={(event) => {
                fenDraftDirtyRef.current = true;
                setFenDraft(event.target.value);
                setFenError("");
              }}
            />
            {fenError ? <small className="analysisTextBoxError">{fenError}</small> : null}
          </div>
        </div>
        <div className="practiceBoardActions">
          <button type="button" className="practiceCopyPgnButton" onClick={handleCopyPgn}>
            {copyPgnLabel === "Copied" ? (
              <FontAwesomeIcon className="practiceCopyPgnCheck" icon={faCheck} aria-hidden="true" />
            ) : null}
            {copyPgnLabel}
          </button>
        </div>
      </div>
    </section>
  );
};
