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
  faShuffle,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { makeSan } from "chessops/san";
import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { Seo } from "../../components/Seo/Seo";
import { createAtomicPosition, moveFromUci } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { appAssetPath } from "../../utils/appAssetPath";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const EXPLORER_REQUEST_TIMEOUT_MS = 15_000;
const PRACTICE_AUTOMOVE_MIN_THINK_MS = 520;
const BOARD_WHEEL_DISCRETE_STEP_PX = 10;
const BOARD_WHEEL_TRACKPAD_STEP_PX = 24;
const BOARD_WHEEL_GESTURE_RESET_MS = 120;
const PLAYER_MIN_RATING = 1700;
const PRACTICE_SETTINGS_STORAGE_KEY = "atomic-puzzles.practice.settings";
const RECENT_USERNAME_STORAGE_KEY = "atomic-puzzles.analysis.recent-usernames";
const MAX_RECENT_USERNAMES = 18;

type ExplorerApiMove = {
  uci: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  avgOpponentRating: number | null;
};

type ExplorerApiResponse = {
  moves: ExplorerApiMove[];
  recentGames: unknown[];
};

type PracticeMove = ExplorerApiMove & {
  san: string;
  share: number;
};

type PracticeStatus = "idle" | "loading" | "ready" | "error";
type PracticeSide = "white" | "black";
type OpponentMode = "frequency" | "random" | "popular";
type OpponentSource = "general" | "player";

type StoredPracticeSettings = {
  side: PracticeSide;
  opponentMode: OpponentMode;
  opponentSource: OpponentSource;
  opponentUsername: string;
  automove: boolean;
};

const DEFAULT_SETTINGS: StoredPracticeSettings = {
  side: "white",
  opponentMode: "frequency",
  opponentSource: "general",
  opponentUsername: "",
  automove: true,
};

const inFlightRequests = new Map<string, Promise<ExplorerApiResponse>>();

const formatGameCount = (games: number): string => {
  if (games >= 1_000_000) {
    return `${(games / 1_000_000).toFixed(games >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }

  if (games >= 1_000) {
    return `${(games / 1_000).toFixed(games >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return String(games);
};

const loadPracticeSettings = (): StoredPracticeSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_SETTINGS;
    const value = parsed as Partial<StoredPracticeSettings>;

    return {
      side: value.side === "black" ? "black" : "white",
      opponentMode:
        value.opponentMode === "random" || value.opponentMode === "popular"
          ? value.opponentMode
          : "frequency",
      opponentSource: value.opponentSource === "player" ? "player" : "general",
      opponentUsername: String(value.opponentUsername ?? "").trim(),
      automove: value.automove !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const storePracticeSettings = (settings: StoredPracticeSettings): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(PRACTICE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const loadRecentUsernames = (): string[] => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_USERNAME_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((username) => String(username).trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT_USERNAMES);
  } catch {
    return [];
  }
};

const storeRecentUsernames = (usernames: string[]): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    RECENT_USERNAME_STORAGE_KEY,
    JSON.stringify(usernames.slice(0, MAX_RECENT_USERNAMES)),
  );
};

const addRecentUsername = (usernames: string[], username: string): string[] => {
  const trimmedUsername = username.trim();
  if (!trimmedUsername) return usernames;

  return [
    trimmedUsername,
    ...usernames.filter(
      (recentUsername) => recentUsername.toLowerCase() !== trimmedUsername.toLowerCase(),
    ),
  ].slice(0, MAX_RECENT_USERNAMES);
};

const oppositeSide = (side: PracticeSide): PracticeSide => (side === "white" ? "black" : "white");

const sanFromUci = (fen: string, uci: string): string => {
  try {
    const position = createAtomicPosition(fen);
    const move = moveFromUci(position, uci);
    return move ? makeSan(position, move) : uci;
  } catch {
    return uci;
  }
};

const buildPracticeExplorerUrl = ({
  fen,
  opponentSource,
  opponentUsername,
  opponentSide,
}: {
  fen: string;
  opponentSource: OpponentSource;
  opponentUsername: string;
  opponentSide: PracticeSide;
}): string => {
  const params = new URLSearchParams({
    fen,
    speeds: "0,1",
  });

  const username = opponentUsername.trim();
  if (opponentSource === "player" && username) {
    params.set("username", username);
    params.set("color", opponentSide);
    params.set("minRating", String(PLAYER_MIN_RATING));
  }

  return `${appAssetPath("/api/opening-explorer")}?${params.toString()}`;
};

const parseExplorerApiResponse = async (
  response: Response,
  explorerApiUrl: string,
): Promise<ExplorerApiResponse> => {
  const text = await response.text();
  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Opening explorer returned invalid JSON from ${explorerApiUrl}.`);
  }

  if (!response.ok) {
    const errorBody = body as { error?: string } | null;
    throw new Error(errorBody?.error ?? "Opening explorer is unavailable");
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as ExplorerApiResponse).moves)) {
    throw new Error("Opening explorer returned an unexpected response.");
  }

  return body as ExplorerApiResponse;
};

const fetchExplorerApiResponse = (explorerApiUrl: string): Promise<ExplorerApiResponse> => {
  const existingRequest = inFlightRequests.get(explorerApiUrl);
  if (existingRequest) return existingRequest;

  const promise = fetch(explorerApiUrl, {
    headers: {
      "X-Explorer-Intent": "practice",
    },
  })
    .then((response) => parseExplorerApiResponse(response, explorerApiUrl))
    .finally(() => {
      if (inFlightRequests.get(explorerApiUrl) === promise) {
        inFlightRequests.delete(explorerApiUrl);
      }
    });

  inFlightRequests.set(explorerApiUrl, promise);
  return promise;
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

const lichessAnalysisUrl = (fen: string): string =>
  `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;

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
  const boardWheelDeltaRef = useRef(0);
  const boardWheelLastAtRef = useRef(0);
  const boardWheelDirectionRef = useRef(0);
  const boardWheelCanStepBackRef = useRef(false);
  const boardWheelCanStepForwardRef = useRef(false);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [pendingAutoMoveUci, setPendingAutoMoveUci] = useState<string | null>(null);
  const [side, setSide] = useState<PracticeSide>(initialSettings.side);
  const [opponentMode, setOpponentMode] = useState<OpponentMode>(initialSettings.opponentMode);
  const [opponentSource, setOpponentSource] = useState<OpponentSource>(
    initialSettings.opponentSource,
  );
  const [opponentUsername, setOpponentUsername] = useState(initialSettings.opponentUsername);
  const [usernameDraft, setUsernameDraft] = useState(initialSettings.opponentUsername);
  const [usernamePickerOpen, setUsernamePickerOpen] = useState(false);
  const [recentUsernames, setRecentUsernames] = useState<string[]>(loadRecentUsernames);
  const [automove, setAutomove] = useState(initialSettings.automove);
  const [databaseExhausted, setDatabaseExhausted] = useState(false);
  const [dbMovesOpen, setDbMovesOpen] = useState(true);
  const [practiceMoves, setPracticeMoves] = useState<PracticeMove[]>([]);
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const [error, setError] = useState("");
  const [hoveredMoveUci, setHoveredMoveUci] = useState<string | null>(null);

  const currentFen = boardState?.fen || STARTING_FEN;
  const currentLichessAnalysisUrl = lichessAnalysisUrl(currentFen);
  const currentTurn = boardState?.turn || "white";
  const opponentSide = oppositeSide(side);
  const moveList = useMemo(
    () => (boardState?.lineMoves ? [...boardState.lineMoves] : []),
    [boardState],
  );
  const currentPly = boardState?.lineIndex ?? 0;
  const canStepBack = currentPly > 0;
  const canStepForward = currentPly < moveList.length;
  const totalGames = practiceMoves.reduce((total, move) => total + move.games, 0);
  const canUsePlayerSource = opponentSource === "general" || Boolean(opponentUsername.trim());

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

  useEffect(() => {
    storePracticeSettings({
      side,
      opponentMode,
      opponentSource,
      opponentUsername,
      automove,
    });
  }, [automove, opponentMode, opponentSource, opponentUsername, side]);

  useEffect(() => {
    if (!canUsePlayerSource) {
      setPracticeMoves([]);
      setStatus("ready");
      setError("");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const explorerApiUrl = buildPracticeExplorerUrl({
      fen: currentFen,
      opponentSource,
      opponentUsername,
      opponentSide,
    });

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

    fetchExplorerApiResponse(explorerApiUrl)
      .then((data) => {
        if (requestCancelled || requestTimedOut || requestId !== requestIdRef.current) return;

        const games = data.moves.reduce((sum, move) => sum + Math.max(0, move.games), 0);
        const nextPracticeMoves = data.moves.map((move) => ({
          ...move,
          san: sanFromUci(currentFen, move.uci),
          share: games > 0 ? (move.games / games) * 100 : 0,
        }));

        setPracticeMoves(nextPracticeMoves);
        setStatus("ready");

        if (
          automove &&
          currentTurn === opponentSide &&
          !databaseExhausted &&
          lastAutoFenRef.current !== currentFen
        ) {
          const autoMove = chooseOpponentMove(nextPracticeMoves, opponentMode);
          if (!autoMove) {
            setDatabaseExhausted(true);
            return;
          }

          lastAutoFenRef.current = currentFen;
          const elapsed = window.performance.now() - requestStartedAt;
          const remainingThinkTime = Math.max(0, PRACTICE_AUTOMOVE_MIN_THINK_MS - elapsed);
          const queueAutoMove = (): void => {
            if (requestCancelled || requestTimedOut || requestId !== requestIdRef.current) return;

            setPendingAutoMoveUci(autoMove.uci);
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
    currentFen,
    currentTurn,
    databaseExhausted,
    opponentMode,
    opponentSide,
    opponentSource,
    opponentUsername,
  ]);

  useEffect(() => {
    setHoveredMoveUci(null);
  }, [currentFen]);

  useEffect(() => {
    boardWheelCanStepBackRef.current = canStepBack;
    boardWheelCanStepForwardRef.current = canStepForward;
  }, [canStepBack, canStepForward]);

  useEffect(() => {
    if (!pendingAutoMoveUci || navigation) return;

    queueNavigation({ playUci: pendingAutoMoveUci });
  }, [navigation, pendingAutoMoveUci, queueNavigation]);

  useEffect(() => {
    if (!pendingAutoMoveUci || currentTurn === opponentSide) return;

    setPendingAutoMoveUci(null);
  }, [currentTurn, opponentSide, pendingAutoMoveUci]);

  const playPracticeMove = useCallback(
    (uci: string): void => {
      lastAutoFenRef.current = "";
      setPendingAutoMoveUci(null);
      setDatabaseExhausted(false);
      setHoveredMoveUci(null);
      queueNavigation({ playUci: uci });
    },
    [queueNavigation],
  );

  const requestNavigation = useCallback(
    (command: NonNullable<SolutionNavigation["command"]>): void => {
      lastAutoFenRef.current = "";
      setPendingAutoMoveUci(null);
      queueNavigation({ command });
    },
    [queueNavigation],
  );

  const handleBoardWheel = useCallback(
    (event: WheelEvent): void => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      event.preventDefault();
      event.stopPropagation();

      const now = window.performance.now();
      const direction = Math.sign(event.deltaY);
      if (direction === 0) return;

      if (
        direction !== boardWheelDirectionRef.current ||
        now - boardWheelLastAtRef.current > BOARD_WHEEL_GESTURE_RESET_MS
      ) {
        boardWheelDeltaRef.current = 0;
      }
      boardWheelLastAtRef.current = now;
      boardWheelDirectionRef.current = direction;

      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
      const scaledDelta = event.deltaY * deltaScale;
      const isDiscreteStep =
        event.deltaMode !== 0 || Math.abs(scaledDelta) >= BOARD_WHEEL_DISCRETE_STEP_PX;

      if (isDiscreteStep) {
        boardWheelDeltaRef.current = 0;
      } else {
        boardWheelDeltaRef.current += scaledDelta;
        if (Math.abs(boardWheelDeltaRef.current) < BOARD_WHEEL_TRACKPAD_STEP_PX) return;
      }

      const command =
        (isDiscreteStep ? scaledDelta : boardWheelDeltaRef.current) > 0 ? "next" : "previous";
      boardWheelDeltaRef.current = 0;

      if (command === "next" && !boardWheelCanStepForwardRef.current) return;
      if (command === "previous" && !boardWheelCanStepBackRef.current) return;

      requestNavigation(command);
    },
    [requestNavigation],
  );

  useEffect(() => {
    const boardPanel = boardPanelRef.current;
    if (!boardPanel) return;

    boardPanel.addEventListener("wheel", handleBoardWheel, { passive: false });

    return () => {
      boardPanel.removeEventListener("wheel", handleBoardWheel);
    };
  }, [handleBoardWheel]);

  const resetPractice = useCallback((): void => {
    lastAutoFenRef.current = "";
    setPendingAutoMoveUci(null);
    setDatabaseExhausted(false);
    queueNavigation({ resetFen: STARTING_FEN });
  }, [queueNavigation]);

  const flipPracticeSide = (): void => {
    lastAutoFenRef.current = "";
    setPendingAutoMoveUci(null);
    setDatabaseExhausted(false);
    setSide((currentSide) => oppositeSide(currentSide));
  };

  const saveRecentUsernames = useCallback((nextUsernames: string[]): void => {
    setRecentUsernames(nextUsernames);
    storeRecentUsernames(nextUsernames);
  }, []);

  const closeUsernamePicker = useCallback((): void => {
    setUsernamePickerOpen(false);
    setUsernameDraft("");
  }, []);

  const openUsernamePicker = useCallback((): void => {
    setUsernameDraft("");
    setUsernamePickerOpen(true);
  }, []);

  const commitUsername = useCallback(
    (nextUsername: string): void => {
      const trimmedUsername = nextUsername.trim();
      if (!trimmedUsername) return;

      setOpponentUsername(trimmedUsername);
      setUsernameDraft(trimmedUsername);
      setOpponentSource("player");
      setDatabaseExhausted(false);
      setPendingAutoMoveUci(null);
      lastAutoFenRef.current = "";
      saveRecentUsernames(addRecentUsername(recentUsernames, trimmedUsername));
      closeUsernamePicker();
    },
    [closeUsernamePicker, recentUsernames, saveRecentUsernames],
  );

  const submitUsernamePicker = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      commitUsername(usernameDraft);
    },
    [commitUsername, usernameDraft],
  );

  const removeRecentUsername = useCallback(
    (usernameToRemove: string): void => {
      saveRecentUsernames(
        recentUsernames.filter(
          (recentUsername) => recentUsername.toLowerCase() !== usernameToRemove.toLowerCase(),
        ),
      );
    },
    [recentUsernames, saveRecentUsernames],
  );

  const clearOpponent = (): void => {
    setOpponentUsername("");
    setUsernameDraft("");
    setOpponentSource("general");
    setDatabaseExhausted(false);
    setPendingAutoMoveUci(null);
    lastAutoFenRef.current = "";
  };

  const showPlayerOpponent = (): void => {
    setOpponentSource("player");
    if (!opponentUsername.trim()) {
      openUsernamePicker();
    }
  };

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
        (key !== "a" && key !== "e" && key !== "f" && !isMoveShortcut) ||
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
      } else {
        flipPracticeSide();
      }
    };

    window.addEventListener("keydown", handlePracticeShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handlePracticeShortcut, { capture: true });
  }, [dbMovesOpen, playPracticeMove, practiceMoves, status, usernamePickerOpen]);

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
    if (opponentSource === "player" && !opponentUsername.trim()) return "Choose a player";
    if (status === "loading") return "Loading database moves";
    if (status === "error") return error;
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
          <div className="practiceSettingGroup">
            <span>Opponent source</span>
            <div className="practiceSegmented" role="group" aria-label="Opponent source">
              <button
                type="button"
                className={opponentSource === "general" ? "active" : ""}
                aria-pressed={opponentSource === "general"}
                onClick={clearOpponent}
              >
                <FontAwesomeIcon icon={faBookOpen} />
                <span>General</span>
              </button>
              <button
                type="button"
                className={opponentSource === "player" ? "active" : ""}
                aria-pressed={opponentSource === "player"}
                onClick={showPlayerOpponent}
              >
                <FontAwesomeIcon icon={faUser} />
                <span>Player</span>
              </button>
            </div>
          </div>

          {opponentSource === "player" ? (
            <div className="analysisPlayerSettings practicePlayerSettings">
              <span>Player</span>
              <div className="practicePlayerChooserRow">
                <button
                  type="button"
                  className="analysisPlayerNameButton"
                  onClick={openUsernamePicker}
                >
                  {opponentUsername.trim() || "Choose player"}
                </button>
                {opponentUsername.trim() ? (
                  <button
                    type="button"
                    className="analysisOpponentClearButton"
                    aria-label="Clear player"
                    title="Clear player"
                    onClick={clearOpponent}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                ) : null}
              </div>
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
                        {opponentSource === "player" && !opponentUsername.trim()
                          ? "Set a player or use the general database."
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
        <div
          className="analysisUsernamePickerBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeUsernamePicker();
            }
          }}
        >
          <section
            className="analysisUsernamePicker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-username-picker-title"
          >
            <button
              type="button"
              className="analysisUsernamePickerClose"
              aria-label="Close username picker"
              onClick={closeUsernamePicker}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
            <h2 id="practice-username-picker-title">Choose player</h2>
            <form className="analysisUsernamePickerForm" onSubmit={submitUsernamePicker}>
              <input
                type="text"
                value={usernameDraft}
                placeholder="Search by username"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                onChange={(event) => setUsernameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  commitUsername(usernameDraft);
                }}
              />
              <button
                type="submit"
                className="analysisUsernamePickerSubmit"
                aria-label={`Select ${usernameDraft.trim() || "username"}`}
                title="Select username"
                disabled={!usernameDraft.trim()}
              >
                <FontAwesomeIcon icon={faCheck} />
              </button>
            </form>
            {recentUsernames.length ? (
              <div className="analysisRecentUsernameGrid" aria-label="Recent username searches">
                {recentUsernames.map((recentUsername) => (
                  <span className="analysisRecentUsernameChip" key={recentUsername}>
                    <button
                      type="button"
                      className={
                        opponentUsername.trim().toLowerCase() === recentUsername.toLowerCase()
                          ? "active"
                          : ""
                      }
                      onClick={() => commitUsername(recentUsername)}
                    >
                      {recentUsername}
                    </button>
                    <button
                      type="button"
                      className="remove"
                      aria-label={`Remove ${recentUsername} from recent searches`}
                      onClick={() => removeRecentUsername(recentUsername)}
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        </div>
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
      </div>
    </section>
  );
};
