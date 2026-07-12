import "../Analysis/Analysis.css";
import "./Practice.css";

import {
  faArrowsRotate,
  faBackward,
  faBackwardStep,
  faBookOpen,
  faCheck,
  faForward,
  faForwardStep,
  faGear,
  faShuffle,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { Seo } from "../../components/Seo/Seo";
import { UsernamePickerModal } from "../../components/UsernamePickerModal/UsernamePickerModal";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { movePrefix } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { appAssetPath } from "../../utils/appAssetPath";
import { sanFromUci } from "../../utils/chessNotation";
import { formatGameCount } from "../../utils/formatters";
import { lichessAtomicAnalysisUrl } from "../../utils/lichess";
import {
  type ExplorerApiMove,
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

type PracticeMove = ExplorerApiMove & {
  san: string;
  share: number;
};

type PracticeStatus = "idle" | "loading" | "ready" | "error";
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
  automove: boolean;
  allowMultiplePlayers: boolean;
  continueWithGeneralDb: boolean;
};

const DEFAULT_SETTINGS: StoredPracticeSettings = {
  side: "white",
  opponentMode: "frequency",
  opponentSource: "general",
  opponentUsernames: [],
  automove: true,
  allowMultiplePlayers: false,
  continueWithGeneralDb: false,
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
      automove: value.automove !== false,
      allowMultiplePlayers,
      continueWithGeneralDb: value.continueWithGeneralDb === true,
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

  const playerResponse = await Promise.all(
    opponentUsernames.map((opponentUsername) =>
      fetchExplorerApiResponse(
        buildPracticeExplorerUrl({ fen, opponentUsername, opponentSide }),
        "practice",
      ),
    ),
  ).then(mergeExplorerApiResponses);

  if (continueWithGeneralDb && playerResponse.moves.length === 0) {
    return {
      response: await fetchGeneralPracticeExplorerResponse({ fen, opponentSide }),
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
  const lastAutoFenRef = useRef("");
  const navigationRef = useRef<SolutionNavigation | null>(null);
  const triedMoveUcisByFenRef = useRef<Map<string, Set<string>>>(new Map());
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
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
  const [automove, setAutomove] = useState(initialSettings.automove);
  const [allowMultiplePlayers, setAllowMultiplePlayers] = useState(
    initialSettings.allowMultiplePlayers,
  );
  const [continueWithGeneralDb, setContinueWithGeneralDb] = useState(
    initialSettings.continueWithGeneralDb,
  );
  const [forceAutoMove, setForceAutoMove] = useState(false);
  const [databaseExhausted, setDatabaseExhausted] = useState(false);
  const [usingGeneralFallback, setUsingGeneralFallback] = useState(false);
  const [dbMovesOpen, setDbMovesOpen] = useState(true);
  const [practiceMoves, setPracticeMoves] = useState<PracticeMove[]>([]);
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const [error, setError] = useState("");
  const [hoveredMoveUci, setHoveredMoveUci] = useState<string | null>(null);
  const [copyPgnLabel, setCopyPgnLabel] = useState("Copy PGN");

  const currentFen = boardState?.fen || STARTING_FEN;
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
        `[FEN "${STARTING_FEN}"]`,
        '[Result "*"]',
        "",
        currentMoveText ? `${currentMoveText} *` : "*",
      ].join("\n"),
    [currentMoveText],
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

  useEffect(() => {
    storePracticeSettings({
      side,
      opponentMode,
      opponentSource,
      opponentUsernames,
      automove,
      allowMultiplePlayers,
      continueWithGeneralDb,
    });
  }, [
    allowMultiplePlayers,
    automove,
    continueWithGeneralDb,
    opponentMode,
    opponentSource,
    opponentUsernames,
    side,
  ]);

  useEffect(() => {
    if (!canUsePlayerSource) {
      setPracticeMoves([]);
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
        setStatus("error");
        setError("Opening explorer took too long to respond.");
      }
    }, EXPLORER_REQUEST_TIMEOUT_MS);

    setStatus("loading");
    setError("");
    setPracticeMoves([]);
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

        const games = data.moves.reduce((sum, move) => sum + Math.max(0, move.games), 0);
        const nextPracticeMoves = data.moves.map((move) => ({
          ...move,
          san: sanFromUci(currentFen, move.uci),
          share: games > 0 ? (move.games / games) * 100 : 0,
        }));

        setPracticeMoves(nextPracticeMoves);
        setUsingGeneralFallback(usedGeneralFallback);
        setStatus("ready");

        if (
          (automove || forceAutoMove) &&
          currentTurn === opponentSide &&
          !databaseExhausted &&
          lastAutoFenRef.current !== currentFen
        ) {
          const autoMove = chooseOpponentMove(
            getUntriedMoves(currentFen, nextPracticeMoves),
            opponentMode,
          );
          if (!autoMove) {
            setDatabaseExhausted(true);
            setForceAutoMove(false);
            return;
          }

          lastAutoFenRef.current = currentFen;
          const elapsed = window.performance.now() - requestStartedAt;
          const remainingThinkTime = Math.max(0, PRACTICE_AUTOMOVE_MIN_THINK_MS - elapsed);
          const queueAutoMove = (): void => {
            if (requestCancelled || requestTimedOut || requestId !== requestIdRef.current) return;

            setForceAutoMove(false);
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
    automove,
    canUsePlayerSource,
    continueWithGeneralDb,
    currentFen,
    currentTurn,
    databaseExhausted,
    forceAutoMove,
    getUntriedMoves,
    opponentMode,
    opponentSide,
    opponentSource,
    opponentUsernames,
  ]);

  useEffect(() => {
    setHoveredMoveUci(null);
  }, [currentFen]);

  useEffect(() => {
    if (!pendingAutoMove || navigation) return;

    recordTriedMove(pendingAutoMove.fen, pendingAutoMove.uci);
    queueNavigation({ playUci: pendingAutoMove.uci });
  }, [navigation, pendingAutoMove, queueNavigation, recordTriedMove]);

  useEffect(() => {
    if (!pendingAutoMove || currentTurn === opponentSide) return;

    setPendingAutoMove(null);
  }, [currentTurn, opponentSide, pendingAutoMove]);

  const playPracticeMove = useCallback(
    (uci: string): void => {
      lastAutoFenRef.current = "";
      setPendingAutoMove(null);
      setForceAutoMove(false);
      setDatabaseExhausted(false);
      setUsingGeneralFallback(false);
      setHoveredMoveUci(null);
      recordTriedMove(currentFen, uci);
      queueNavigation({ playUci: uci });
    },
    [currentFen, queueNavigation, recordTriedMove],
  );

  const requestNavigation = useCallback(
    (command: NonNullable<SolutionNavigation["command"]>): void => {
      lastAutoFenRef.current = "";
      setPendingAutoMove(null);
      setForceAutoMove(false);
      setDatabaseExhausted(false);
      setUsingGeneralFallback(false);
      queueNavigation({ command });
    },
    [queueNavigation],
  );

  useBoardWheelNavigation({
    boardPanelRef,
    canStepBack,
    canStepForward,
    onNavigate: requestNavigation,
  });

  const resetPractice = useCallback((): void => {
    lastAutoFenRef.current = "";
    setPendingAutoMove(null);
    setForceAutoMove(false);
    setDatabaseExhausted(false);
    setUsingGeneralFallback(false);
    clearTriedMoves();
    queueNavigation({ resetFen: STARTING_FEN });
  }, [clearTriedMoves, queueNavigation]);

  const flipPracticeSide = useCallback((): void => {
    lastAutoFenRef.current = "";
    setPendingAutoMove(null);
    setForceAutoMove(false);
    setDatabaseExhausted(false);
    setUsingGeneralFallback(false);
    clearTriedMoves();
    setSide((currentSide) => oppositeSide(currentSide));
  }, [clearTriedMoves]);

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
      setDatabaseExhausted(false);
      setUsingGeneralFallback(false);
      setPendingAutoMove(null);
      setForceAutoMove(false);
      clearTriedMoves();
      lastAutoFenRef.current = "";
      saveRecentUsernames(addRecentUsername(recentUsernames, trimmedUsername));

      if (!allowMultiplePlayers) {
        closeUsernamePicker();
      }
    },
    [
      allowMultiplePlayers,
      clearTriedMoves,
      closeUsernamePicker,
      recentUsernames,
      saveRecentUsernames,
    ],
  );

  const removeRecentUsername = useCallback(
    (usernameToRemove: string): void => {
      saveRecentUsernames(removeRecentUsernameFromList(recentUsernames, usernameToRemove));
    },
    [recentUsernames, saveRecentUsernames],
  );

  const clearSelectedPlayers = (): void => {
    setOpponentUsernames([]);
    setOpponentSource("player");
    setDatabaseExhausted(false);
    setUsingGeneralFallback(false);
    setPendingAutoMove(null);
    setForceAutoMove(false);
    clearTriedMoves();
    lastAutoFenRef.current = "";
  };

  const removeOpponentUsername = useCallback(
    (usernameToRemove: string): void => {
      setOpponentUsernames((currentUsernames) =>
        currentUsernames.filter(
          (username) => username.toLowerCase() !== usernameToRemove.toLowerCase(),
        ),
      );
      setDatabaseExhausted(false);
      setUsingGeneralFallback(false);
      setPendingAutoMove(null);
      setForceAutoMove(false);
      clearTriedMoves();
      lastAutoFenRef.current = "";
    },
    [clearTriedMoves],
  );

  const updateAllowMultiplePlayers = (allowMultiple: boolean): void => {
    setAllowMultiplePlayers(allowMultiple);
    setDatabaseExhausted(false);
    setUsingGeneralFallback(false);
    setPendingAutoMove(null);
    setForceAutoMove(false);
    clearTriedMoves();
    lastAutoFenRef.current = "";

    if (!allowMultiple) {
      setOpponentUsernames((currentUsernames) => currentUsernames.slice(0, 1));
    }
  };

  const showGeneralOpponent = (): void => {
    setOpponentSource("general");
    setDatabaseExhausted(false);
    setUsingGeneralFallback(false);
    setPendingAutoMove(null);
    setForceAutoMove(false);
    clearTriedMoves();
    lastAutoFenRef.current = "";
  };

  const showPlayerOpponent = (): void => {
    setOpponentSource("player");
    setDatabaseExhausted(false);
    setUsingGeneralFallback(false);
    setPendingAutoMove(null);
    setForceAutoMove(false);
    clearTriedMoves();
    lastAutoFenRef.current = "";

    if (opponentUsernames.length === 0) {
      openUsernamePicker();
    }
  };

  const requestAlternateAutoMove = useCallback((): void => {
    lastAutoFenRef.current = "";
    setPendingAutoMove(null);
    setDatabaseExhausted(false);
    setUsingGeneralFallback(false);
    setForceAutoMove(true);

    if (currentTurn !== opponentSide && canStepBack) {
      queueNavigation({ command: "previous" });
    }
  }, [canStepBack, currentTurn, opponentSide, queueNavigation]);

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
        if (!dbMovesOpen || status !== "ready") return;

        const move = practiceMoves[shortcutIndex];
        if (!move) return;

        event.preventDefault();
        playPracticeMove(move.uci);
        return;
      }

      event.preventDefault();
      if (key === "e") {
        setDbMovesOpen((open) => !open);
      } else if (key === "a") {
        lastAutoFenRef.current = "";
        setAutomove((current) => !current);
      } else if (key === "q") {
        requestAlternateAutoMove();
      } else {
        flipPracticeSide();
      }
    };

    window.addEventListener("keydown", handlePracticeShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handlePracticeShortcut, { capture: true });
  }, [
    dbMovesOpen,
    flipPracticeSide,
    playPracticeMove,
    practiceMoves,
    requestAlternateAutoMove,
    status,
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
    if (opponentSource === "player" && opponentUsernames.length === 0) return "Choose player";
    if (status === "loading") return "Loading database moves";
    if (status === "error") return error;
    if (usingGeneralFallback) return "Using general database";
    if (databaseExhausted) return "Database line ended";
    if (!automove) return "Manual opponent moves";
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
        className={`analysisPanel practicePanel ${dbMovesOpen ? "" : "dbMovesCollapsed"}`}
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
              aria-label={`Play as ${opponentSide}`}
              title="Switch sides"
              onClick={flipPracticeSide}
            >
              <FontAwesomeIcon icon={faArrowsRotate} />
              <span>{side}</span>
            </button>
          </div>
        </div>

        <div className="practiceStatus" aria-live="polite">
          <span>{statusText}</span>
          <strong>{totalGames ? `${formatGameCount(totalGames)} games` : "0 games"}</strong>
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

          {settingsOpen ? (
            <div className="analysisFilterPanel practiceSettingsPanel" id="practice-settings-panel">
              {opponentSource === "player" ? (
                <div className="analysisPlayerSettings practicePlayerSettings">
                  <span>{allowMultiplePlayers ? "Players" : "Player"}</span>
                  <div className="practicePlayerChooserRow">
                    <button
                      type="button"
                      className="analysisPlayerNameButton"
                      onClick={openUsernamePicker}
                      disabled={!canChoosePracticePlayer}
                    >
                      {canChoosePracticePlayer
                        ? allowMultiplePlayers
                          ? "Add player"
                          : opponentUsernames.length
                            ? "Change player"
                            : "Choose player"
                        : "Player limit reached"}
                    </button>
                    {opponentUsernames.length ? (
                      <button
                        type="button"
                        className="analysisOpponentClearButton"
                        aria-label="Clear players"
                        title="Clear players"
                        onClick={clearSelectedPlayers}
                      >
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    ) : null}
                  </div>
                  {opponentUsernames.length ? (
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
                <span>Automove</span>
                <input
                  type="checkbox"
                  checked={automove}
                  onChange={(event) => {
                    lastAutoFenRef.current = "";
                    setAutomove(event.target.checked);
                  }}
                />
              </label>

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
                    setDatabaseExhausted(false);
                    setUsingGeneralFallback(false);
                    setPendingAutoMove(null);
                    setForceAutoMove(false);
                    clearTriedMoves();
                    lastAutoFenRef.current = "";
                  }}
                />
              </label>
            </div>
          ) : null}
        </section>

        {dbMovesOpen ? (
          <section className="practiceMovesPanel" aria-label="Database moves">
            <div className="analysisSectionTitle">
              <span>Database moves</span>
              <small>{opponentSide}</small>
            </div>
            <div className="practiceMoveTableWrap">
              <table className="practiceMoveTable">
                <thead>
                  <tr>
                    <th>Move</th>
                    <th>Games</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <tr>
                      <td colSpan={3}>Loading...</td>
                    </tr>
                  ) : null}
                  {status === "error" ? (
                    <tr>
                      <td colSpan={3}>{error}</td>
                    </tr>
                  ) : null}
                  {status === "ready" && practiceMoves.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        {opponentSource === "player" && opponentUsernames.length === 0
                          ? "Choose a player or use the general database."
                          : "No database continuation."}
                      </td>
                    </tr>
                  ) : null}
                  {practiceMoves.map((move) => (
                    <tr
                      key={move.uci}
                      role="button"
                      tabIndex={0}
                      onPointerEnter={() => setHoveredMoveUci(move.uci)}
                      onPointerLeave={() => setHoveredMoveUci(null)}
                      onFocus={() => setHoveredMoveUci(move.uci)}
                      onBlur={() => setHoveredMoveUci(null)}
                      onClick={() => playPracticeMove(move.uci)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        playPracticeMove(move.uci);
                      }}
                    >
                      <td>{move.san}</td>
                      <td>{formatGameCount(move.games)}</td>
                      <td>
                        <span
                          className="practiceShareBar"
                          style={{ "--practice-share": `${move.share}%` } as CSSProperties}
                        >
                          <span />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="analysisBottomToolbar practiceToolbar" aria-label="Practice navigation">
          <button
            type="button"
            className="analysisToolbarButton"
            aria-label="Reset practice"
            title="Reset practice"
            onClick={resetPractice}
          >
            <FontAwesomeIcon icon={faArrowsRotate} />
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
            fen={STARTING_FEN}
            orientation={side}
            coordinates
            solution=""
            showSolution={false}
            analysisMode
            solutionNavigation={navigation}
            previewMove={hoveredMoveUci}
            onNavigateHandled={() => {
              const handledNavigation = navigation;
              clearHandledNavigation(handledNavigation);
            }}
            onStateChange={setBoardState}
          />
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
