import "./Analysis.css";

import {
  faArrowsRotate,
  faBackward,
  faBackwardStep,
  faBookOpen,
  faCheck,
  faExternalLinkAlt,
  faForward,
  faForwardStep,
  faGear,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { makeSan } from "chessops/san";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { Seo } from "../../components/Seo/Seo";
import { createAtomicPosition, moveFromUci } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { appAssetPath } from "../../utils/appAssetPath";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIN_MOVE_PANEL_HEIGHT = 86;
const MIN_EXPLORER_PANEL_HEIGHT = 220;
const EXPLORER_RESIZE_STEP = 24;

type ExplorerApiMove = {
  uci: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  avgOpponentRating: number | null;
};

type ExplorerApiGame = {
  uci: string;
  gameId: string;
  playedAt: number;
  playedOn: number;
  white: string | null;
  black: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  winner: 0 | 1 | 2;
};

type ExplorerApiResponse = {
  moves: ExplorerApiMove[];
  recentGames: ExplorerApiGame[];
};

type ExplorerMove = {
  uci: string;
  move: string;
  games: number;
  gamesLabel: string;
  whiteWins: number;
  draws: number;
  blackWins: number;
  white: number;
  draw: number;
  black: number;
  avgOpponentRating: number | null;
  performanceRating: number | null;
};

type ExplorerGame = {
  uci: string;
  move: string;
  gameId: string;
  playedOn: string;
  whiteName: string;
  blackName: string;
  whiteRating: number | null;
  blackRating: number | null;
  result: string;
  resultClass: "white" | "draw" | "black";
};

type ExplorerStatus = "idle" | "loading" | "ready" | "error";
type ExplorerScope = "general" | "player";
type ExplorerSpeed = "bullet" | "blitz";
type UsernamePickerTarget = "player" | "opponent";

const WIN_RATE_LABEL_MIN_PERCENT = 14;
const BOARD_WHEEL_DISCRETE_STEP_PX = 10;
const BOARD_WHEEL_TRACKPAD_STEP_PX = 24;
const BOARD_WHEEL_GESTURE_RESET_MS = 120;
const EXPLORER_REQUEST_TIMEOUT_MS = 15_000;
const MONTH_FILTER_PATTERN = /^\d{4}-\d{2}$/;
const EXPLORER_SETTINGS_STORAGE_KEY = "atomic-puzzles.analysis.explorer-settings";
const RECENT_USERNAME_STORAGE_KEY = "atomic-puzzles.analysis.recent-usernames";
const BOARD_SIZE_STORAGE_KEY = "atomic-puzzles.analysis.board-size";
const MAX_RECENT_USERNAMES = 18;
const DEFAULT_ANALYSIS_BOARD_SIZE = 516;
const MIN_ANALYSIS_BOARD_SIZE = 320;
const MAX_ANALYSIS_BOARD_SIZE = 760;
const ANALYSIS_DESKTOP_RESERVED_WIDTH = 430;
const DEFAULT_PLAYER_START_DATE = "2025-01";
const SPEED_FILTERS: Array<{ key: ExplorerSpeed; label: string; value: 0 | 1 }> = [
  { key: "bullet", label: "Bullet", value: 0 },
  { key: "blitz", label: "Blitz", value: 1 },
];
const EXPLORER_SPEED_KEYS = SPEED_FILTERS.map((speed) => speed.key);
const DEFAULT_EXPLORER_SETTINGS = {
  explorerScope: "general" as ExplorerScope,
  playerColor: "white" as "white" | "black",
  selectedSpeeds: ["bullet", "blitz"] as ExplorerSpeed[],
  minRating: 1700,
  startDate: "",
  endDate: "",
  username: "",
  opponent: "",
};

type StoredExplorerSettings = typeof DEFAULT_EXPLORER_SETTINGS;

const clampRating = (rating: number): number =>
  Math.max(1700, Math.min(2200, Number.isFinite(rating) ? rating : 1700));

const clampAnalysisBoardSize = (size: number, maxSize = MAX_ANALYSIS_BOARD_SIZE): number =>
  Math.round(
    Math.max(
      MIN_ANALYSIS_BOARD_SIZE,
      Math.min(maxSize, Number.isFinite(size) ? size : DEFAULT_ANALYSIS_BOARD_SIZE),
    ),
  );

const getMaxAnalysisBoardSize = (): number => {
  if (typeof window === "undefined") return MAX_ANALYSIS_BOARD_SIZE;

  const viewportWidth = window.innerWidth;
  if (viewportWidth <= 780) {
    return Math.max(MIN_ANALYSIS_BOARD_SIZE, Math.min(MAX_ANALYSIS_BOARD_SIZE, viewportWidth - 20));
  }

  if (viewportWidth <= 980) {
    return Math.min(MAX_ANALYSIS_BOARD_SIZE, 720);
  }

  return Math.max(
    MIN_ANALYSIS_BOARD_SIZE,
    Math.min(MAX_ANALYSIS_BOARD_SIZE, viewportWidth - ANALYSIS_DESKTOP_RESERVED_WIDTH),
  );
};

const validMonthFilter = (value: unknown): string => {
  const monthValue = String(value ?? "").trim();
  return MONTH_FILTER_PATTERN.test(monthValue) ? monthValue : "";
};

const normalizeStoredSpeeds = (value: unknown): ExplorerSpeed[] => {
  if (!Array.isArray(value)) return DEFAULT_EXPLORER_SETTINGS.selectedSpeeds;

  const speeds = value.filter((speed): speed is ExplorerSpeed =>
    EXPLORER_SPEED_KEYS.includes(speed as ExplorerSpeed),
  );

  return speeds.length ? [...new Set(speeds)] : DEFAULT_EXPLORER_SETTINGS.selectedSpeeds;
};

const loadExplorerSettings = (): StoredExplorerSettings => {
  if (typeof window === "undefined") return DEFAULT_EXPLORER_SETTINGS;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(EXPLORER_SETTINGS_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_EXPLORER_SETTINGS;
    }

    const rawSettings = parsed as Partial<StoredExplorerSettings>;
    const explorerScope = rawSettings.explorerScope === "player" ? "player" : "general";
    const playerColor = rawSettings.playerColor === "black" ? "black" : "white";
    const startDate =
      explorerScope === "player"
        ? validMonthFilter(rawSettings.startDate) || DEFAULT_PLAYER_START_DATE
        : "";

    return {
      explorerScope,
      playerColor,
      selectedSpeeds: normalizeStoredSpeeds(rawSettings.selectedSpeeds),
      minRating: clampRating(Number(rawSettings.minRating)),
      startDate,
      endDate: validMonthFilter(rawSettings.endDate),
      username: String(rawSettings.username ?? "").trim(),
      opponent: String(rawSettings.opponent ?? "").trim(),
    };
  } catch {
    return DEFAULT_EXPLORER_SETTINGS;
  }
};

const storeExplorerSettings = (settings: StoredExplorerSettings): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(EXPLORER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const loadRecentUsernames = (): string[] => {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_USERNAME_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value) => String(value).trim())
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

const loadBoardSize = (): number => {
  if (typeof window === "undefined") return DEFAULT_ANALYSIS_BOARD_SIZE;

  const storedSize = Number(window.localStorage.getItem(BOARD_SIZE_STORAGE_KEY));
  return clampAnalysisBoardSize(
    Number.isFinite(storedSize) && storedSize > 0 ? storedSize : DEFAULT_ANALYSIS_BOARD_SIZE,
    getMaxAnalysisBoardSize(),
  );
};

const storeBoardSize = (size: number): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(BOARD_SIZE_STORAGE_KEY, String(size));
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

const SpeedFilterIcon = ({ speed }: { speed: ExplorerSpeed }) =>
  speed === "bullet" ? (
    <svg
      className="analysisSpeedIcon bullet"
      viewBox="0 0 44 28"
      aria-hidden="true"
      focusable="false"
    >
      <path className="speedLines" d="M4 8.2h8M1.5 14h9.5M4 19.8h8" />
      <path
        className="bulletBody"
        d="M15.1 6.2c3.5-1.7 8.9-1.8 14.4.4 5.2 2.1 9.2 5.7 11.1 7.4-1.9 1.7-5.9 5.3-11.1 7.4-5.5 2.2-10.9 2.1-14.4.4-1.1-4.8-1.1-10.8 0-15.6Z"
      />
      <path
        className="bulletDetail"
        d="M16.7 7.7c5.2-1.1 12.9.4 20.1 6.3-7.2 5.9-14.9 7.4-20.1 6.3"
      />
    </svg>
  ) : (
    <svg
      className="analysisSpeedIcon blitz"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="flameBody"
        d="M18.1 2.4c2.8 5.1 1 8.1-1.5 10.4 3.7-1.1 5.7-4 5.4-8.4 4.2 3.5 6.3 7.8 6.3 12.4 0 7.1-5.1 12.4-12.3 12.4-7.1 0-12.3-4.8-12.3-11.4 0-4.9 2.7-8.3 6.2-11.1 2.7-2.1 5.8-3.7 8.2-4.3Z"
      />
      <path
        className="cutout"
        d="M16.4 17.3c2.2 1.6 3.4 3.5 3.4 5.5 0 3-2.1 5.1-5.2 5.1-2.9 0-5.1-2-5.1-4.9 0-2 1.2-3.5 3-4.8.5 1.7 1.7 2.9 3.4 3.4-.2-1.6 0-2.9.5-4.3Z"
      />
    </svg>
  );

const visibleWinRateLabel = (rate: number): string =>
  rate >= WIN_RATE_LABEL_MIN_PERCENT ? `${rate}%` : "";

const formatGameCount = (games: number): string => {
  if (games >= 1_000_000) {
    return `${(games / 1_000_000).toFixed(games >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }

  if (games >= 1_000) {
    return `${(games / 1_000).toFixed(games >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return String(games);
};

const sanFromUci = (fen: string, uci: string): string => {
  try {
    const position = createAtomicPosition(fen);
    const move = moveFromUci(position, uci);
    return move ? makeSan(position, move) : uci;
  } catch {
    return uci;
  }
};

const formatEncodedDate = (date: number): string => {
  const raw = String(date);
  if (!/^\d{8}$/.test(raw)) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

const resultFromWinner = (winner: ExplorerApiGame["winner"]): string => {
  if (winner === 1) return "1-0";
  if (winner === 2) return "0-1";
  return "1/2-1/2";
};

const resultClassFromWinner = (winner: ExplorerApiGame["winner"]): ExplorerGame["resultClass"] => {
  if (winner === 1) return "white";
  if (winner === 2) return "black";
  return "draw";
};

const performanceFromScore = (
  avgOpponentRating: number | null,
  score: number,
  games: number,
): number | null => {
  if (!avgOpponentRating || games <= 0) return null;

  const scoreRate = Math.min(0.99, Math.max(0.01, score / games));
  const ratingDiff = -400 * Math.log10(1 / scoreRate - 1);
  return Math.round(avgOpponentRating + ratingDiff);
};

const toExplorerMove = (
  row: ExplorerApiMove,
  fen: string,
  options: { scope: ExplorerScope; playerColor: "white" | "black" },
): ExplorerMove => {
  const totalResults = row.whiteWins + row.draws + row.blackWins;
  const total = totalResults > 0 ? totalResults : row.games;
  const white = total > 0 ? Math.round((row.whiteWins / total) * 100) : 0;
  const draw = total > 0 ? Math.round((row.draws / total) * 100) : 0;
  const black = total > 0 ? Math.round((row.blackWins / total) * 100) : 0;
  const playerScore =
    options.playerColor === "white" ? row.whiteWins + row.draws / 2 : row.blackWins + row.draws / 2;

  return {
    uci: row.uci,
    move: sanFromUci(fen, row.uci),
    games: row.games,
    gamesLabel: formatGameCount(row.games),
    whiteWins: row.whiteWins,
    draws: row.draws,
    blackWins: row.blackWins,
    white,
    draw,
    black,
    avgOpponentRating: row.avgOpponentRating,
    performanceRating:
      options.scope === "player"
        ? performanceFromScore(row.avgOpponentRating, playerScore, total)
        : null,
  };
};

const toExplorerGame = (row: ExplorerApiGame, fen: string): ExplorerGame => ({
  uci: row.uci,
  move: sanFromUci(fen, row.uci),
  gameId: row.gameId,
  playedOn: formatEncodedDate(row.playedOn),
  whiteName: row.white ?? "?",
  blackName: row.black ?? "?",
  whiteRating: row.whiteRating,
  blackRating: row.blackRating,
  result: resultFromWinner(row.winner),
  resultClass: resultClassFromWinner(row.winner),
});

const lichessAnalysisUrl = (fen: string): string =>
  `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;

export const AnalysisPage = () => {
  const [initialExplorerSettings] = useState(loadExplorerSettings);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const movePanelRef = useRef<HTMLDivElement | null>(null);
  const moveSettingsRef = useRef<HTMLDivElement | null>(null);
  const boardWheelDeltaRef = useRef(0);
  const boardWheelLastAtRef = useRef(0);
  const boardWheelDirectionRef = useRef(0);
  const boardWheelCanStepBackRef = useRef(false);
  const boardWheelCanStepForwardRef = useRef(false);
  const fenDraftDirtyRef = useRef(false);
  const pgnDraftDirtyRef = useRef(false);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [boardSize, setBoardSize] = useState(loadBoardSize);
  const [rootFen, setRootFen] = useState(STARTING_FEN);
  const [fenDraft, setFenDraft] = useState(STARTING_FEN);
  const [pgnDraft, setPgnDraft] = useState("*");
  const [activeTextEditor, setActiveTextEditor] = useState<"fen" | "pgn" | null>(null);
  const [fenError, setFenError] = useState("");
  const [pgnError, setPgnError] = useState("");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moveSettingsOpen, setMoveSettingsOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [movePanelHeight, setMovePanelHeight] = useState<number | null>(null);
  const [explorerResizing, setExplorerResizing] = useState(false);
  const [explorerScope, setExplorerScope] = useState<ExplorerScope>(
    initialExplorerSettings.explorerScope,
  );
  const [playerColor, setPlayerColor] = useState<"white" | "black">(
    initialExplorerSettings.playerColor,
  );
  const [selectedSpeeds, setSelectedSpeeds] = useState<ExplorerSpeed[]>(
    initialExplorerSettings.selectedSpeeds,
  );
  const [minRating, setMinRating] = useState(initialExplorerSettings.minRating);
  const [startDate, setStartDate] = useState(initialExplorerSettings.startDate);
  const [endDate, setEndDate] = useState(initialExplorerSettings.endDate);
  const [username, setUsername] = useState(initialExplorerSettings.username);
  const [opponent, setOpponent] = useState(initialExplorerSettings.opponent);
  const [usernameDraft, setUsernameDraft] = useState(initialExplorerSettings.username);
  const [usernamePickerOpen, setUsernamePickerOpen] = useState(false);
  const [usernamePickerTarget, setUsernamePickerTarget] = useState<UsernamePickerTarget>("player");
  const [recentUsernames, setRecentUsernames] = useState<string[]>(loadRecentUsernames);
  const [explorerMoves, setExplorerMoves] = useState<ExplorerMove[]>([]);
  const [recentGames, setRecentGames] = useState<ExplorerGame[]>([]);
  const [explorerStatus, setExplorerStatus] = useState<ExplorerStatus>("idle");
  const [explorerError, setExplorerError] = useState("");

  const moveList = boardState?.lineMoves ?? [];
  const currentFen = boardState?.fen || STARTING_FEN;
  const currentLichessAnalysisUrl = lichessAnalysisUrl(currentFen);
  const currentPly = boardState?.lineIndex ?? 0;
  const analysisPageStyle = {
    "--analysis-board-size": `${boardSize}px`,
  } as CSSProperties;
  const canStepBack = currentPly > 0;
  const canStepForward = currentPly < moveList.length;
  const showExplorerResults = !filtersOpen;
  const explorerColumnCount = explorerScope === "player" ? 4 : 3;
  const explorerSummary = explorerMoves.reduce(
    (summary, row) => ({
      games: summary.games + row.games,
      whiteWins: summary.whiteWins + row.whiteWins,
      draws: summary.draws + row.draws,
      blackWins: summary.blackWins + row.blackWins,
    }),
    { games: 0, whiteWins: 0, draws: 0, blackWins: 0 },
  );
  const explorerSummaryWhite =
    explorerSummary.games > 0
      ? Math.round((explorerSummary.whiteWins / explorerSummary.games) * 100)
      : 0;
  const explorerSummaryDraw =
    explorerSummary.games > 0
      ? Math.round((explorerSummary.draws / explorerSummary.games) * 100)
      : 0;
  const explorerSummaryBlack =
    explorerSummary.games > 0 ? Math.max(0, 100 - explorerSummaryWhite - explorerSummaryDraw) : 0;
  const rightPanelStyle =
    explorerOpen && movePanelHeight !== null
      ? ({ "--analysis-move-panel-height": `${movePanelHeight}px` } as CSSProperties)
      : undefined;

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

  useEffect(() => {
    if (activeTextEditor !== "fen") {
      setFenDraft(currentFen);
    }
  }, [activeTextEditor, currentFen]);

  useEffect(() => {
    if (activeTextEditor !== "pgn") {
      setPgnDraft(pgnText);
    }
  }, [activeTextEditor, pgnText]);

  useEffect(() => {
    if (boardState?.status === "Invalid PGN" && boardState.error) {
      setPgnError(boardState.error);
      return;
    }

    if (boardState?.status !== "Invalid PGN") {
      setPgnError("");
    }
  }, [boardState?.error, boardState?.status]);

  const requestNavigation = (command: NonNullable<SolutionNavigation["command"]>): void => {
    setNavigation({ command });
  };

  const flipBoard = useCallback((): void => {
    setOrientation((current) => (current === "white" ? "black" : "white"));
  }, []);

  useEffect(() => {
    if (!moveSettingsOpen) return;

    const closeMoveSettings = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && moveSettingsRef.current?.contains(target)) return;

      setMoveSettingsOpen(false);
    };

    const closeMoveSettingsOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMoveSettingsOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeMoveSettings);
    window.addEventListener("keydown", closeMoveSettingsOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMoveSettings);
      window.removeEventListener("keydown", closeMoveSettingsOnEscape);
    };
  }, [moveSettingsOpen]);

  useEffect(() => {
    boardWheelCanStepBackRef.current = canStepBack;
    boardWheelCanStepForwardRef.current = canStepForward;
  }, [canStepBack, canStepForward]);

  const handleBoardWheel = useCallback((event: WheelEvent): void => {
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

    setNavigation({ command });
  }, []);

  useEffect(() => {
    const boardPanel = boardPanelRef.current;
    if (!boardPanel) return;

    boardPanel.addEventListener("wheel", handleBoardWheel, { passive: false });

    return () => {
      boardPanel.removeEventListener("wheel", handleBoardWheel);
    };
  }, [handleBoardWheel]);

  useEffect(() => {
    storeBoardSize(boardSize);
  }, [boardSize]);

  useEffect(() => {
    const handleWindowResize = (): void => {
      setBoardSize((currentSize) => clampAnalysisBoardSize(currentSize, getMaxAnalysisBoardSize()));
    };

    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const handleBoardResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = boardSize;
    const pointerId = event.pointerId;
    const controller = new AbortController();
    handle.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) return;

      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const resizeDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;

      setBoardSize(clampAnalysisBoardSize(startSize + resizeDelta, getMaxAnalysisBoardSize()));
    };

    const handlePointerUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== pointerId) return;
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      controller.abort();
    };

    handle.addEventListener("pointermove", handlePointerMove, {
      passive: false,
      signal: controller.signal,
    });
    handle.addEventListener("pointerup", handlePointerUp, { signal: controller.signal });
    handle.addEventListener("pointercancel", handlePointerUp, { signal: controller.signal });
  };

  const navigateToPly = (plyIndex: number): void => {
    setNavigation({ useHistory: true, plyIndex });
  };

  const playExplorerMove = (uci: string): void => {
    setNavigation({ playUci: uci });
  };

  const commitFenDraft = (draft = fenDraft, force = false): void => {
    if (!force && !fenDraftDirtyRef.current) {
      setFenError("");
      setActiveTextEditor(null);
      return;
    }

    const nextFen = draft.trim();
    try {
      createAtomicPosition(nextFen);
    } catch (error) {
      setFenError(error instanceof Error ? error.message : "Invalid FEN");
      return;
    }

    setRootFen(nextFen);
    setFenDraft(nextFen);
    setPgnDraft("*");
    fenDraftDirtyRef.current = false;
    pgnDraftDirtyRef.current = false;
    setActiveTextEditor(null);
    setFenError("");
    setPgnError("");
    setNavigation({ resetFen: nextFen });
  };

  const commitPgnDraft = (draft = pgnDraft, force = false): void => {
    if (!force && !pgnDraftDirtyRef.current) {
      setPgnError("");
      setActiveTextEditor(null);
      return;
    }

    setPgnError("");
    setNavigation({ loadPgn: draft, loadPgnFen: rootFen });
    pgnDraftDirtyRef.current = false;
    setActiveTextEditor(null);
  };

  const handleFenKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    commitFenDraft(event.currentTarget.value, true);
  };

  const handlePgnKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    commitPgnDraft(event.currentTarget.value, true);
  };

  const clampMovePanelHeight = useCallback((nextHeight: number): number | null => {
    const panel = rightPanelRef.current;
    if (!panel) return null;

    const panelHeight = panel.getBoundingClientRect().height;
    const maxHeight = Math.max(MIN_MOVE_PANEL_HEIGHT, panelHeight - MIN_EXPLORER_PANEL_HEIGHT);
    return Math.round(Math.min(Math.max(nextHeight, MIN_MOVE_PANEL_HEIGHT), maxHeight));
  }, []);

  const adjustExplorerSplit = useCallback(
    (delta: number): void => {
      const panel = rightPanelRef.current;
      const fallbackHeight =
        movePanelRef.current?.getBoundingClientRect().height ??
        (panel ? panel.getBoundingClientRect().height * 0.32 : MIN_MOVE_PANEL_HEIGHT);
      const currentHeight = movePanelHeight ?? fallbackHeight;
      const nextHeight = clampMovePanelHeight(currentHeight + delta);
      if (nextHeight !== null) {
        setMovePanelHeight(nextHeight);
      }
    },
    [clampMovePanelHeight, movePanelHeight],
  );

  const handleExplorerResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!rightPanelRef.current) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setExplorerResizing(true);

    const ownerDocument = event.currentTarget.ownerDocument;
    const startY = event.clientY;
    const startHeight =
      movePanelHeight ??
      movePanelRef.current?.getBoundingClientRect().height ??
      MIN_MOVE_PANEL_HEIGHT;

    const handlePointerMove = (pointerEvent: PointerEvent): void => {
      pointerEvent.preventDefault();
      const nextHeight = clampMovePanelHeight(startHeight + pointerEvent.clientY - startY);
      if (nextHeight !== null) {
        setMovePanelHeight(nextHeight);
      }
    };
    const handlePointerUp = (): void => {
      setExplorerResizing(false);
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
      ownerDocument.removeEventListener("pointerup", handlePointerUp);
      ownerDocument.removeEventListener("pointercancel", handlePointerUp);
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", handlePointerUp);
    ownerDocument.addEventListener("pointercancel", handlePointerUp);
  };

  const handleExplorerResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      adjustExplorerSplit(-EXPLORER_RESIZE_STEP);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      adjustExplorerSplit(EXPLORER_RESIZE_STEP);
    }
  };

  const saveRecentUsernames = (nextUsernames: string[]): void => {
    setRecentUsernames(nextUsernames);
    storeRecentUsernames(nextUsernames);
  };

  const closeUsernamePicker = (): void => {
    setUsernamePickerOpen(false);
    setUsernameDraft("");
  };

  const openUsernamePicker = (target: UsernamePickerTarget): void => {
    setUsernamePickerTarget(target);
    setUsernameDraft("");
    setUsernamePickerOpen(true);
  };

  const commitUsername = (nextUsername: string): void => {
    const trimmedUsername = nextUsername.trim();
    if (!trimmedUsername) return;

    if (usernamePickerTarget === "opponent") {
      setOpponent(trimmedUsername);
    } else {
      setUsername(trimmedUsername);
    }

    setUsernameDraft(trimmedUsername);
    setExplorerScope("player");
    setStartDate(
      (currentStartDate) => validMonthFilter(currentStartDate) || DEFAULT_PLAYER_START_DATE,
    );
    saveRecentUsernames(addRecentUsername(recentUsernames, trimmedUsername));
    closeUsernamePicker();
  };

  const submitUsernamePicker = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    commitUsername(usernameDraft);
  };

  const removeRecentUsername = (usernameToRemove: string): void => {
    saveRecentUsernames(
      recentUsernames.filter(
        (recentUsername) => recentUsername.toLowerCase() !== usernameToRemove.toLowerCase(),
      ),
    );
  };

  const switchPlayerColor = (): void => {
    setPlayerColor((currentColor) => (currentColor === "white" ? "black" : "white"));
  };

  const showPlayerExplorer = (playerTabWasSelected: boolean): void => {
    if (playerTabWasSelected && username.trim()) {
      switchPlayerColor();
      setFiltersOpen(false);
      return;
    }

    setExplorerScope("player");
    setStartDate(
      (currentStartDate) => validMonthFilter(currentStartDate) || DEFAULT_PLAYER_START_DATE,
    );
    if (username.trim()) {
      setFiltersOpen(false);
      return;
    }

    setFiltersOpen(true);
  };

  const toggleSpeed = (speed: ExplorerSpeed): void => {
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
    storeExplorerSettings({
      explorerScope,
      playerColor,
      selectedSpeeds,
      minRating,
      startDate,
      endDate,
      username,
      opponent,
    });
  }, [
    endDate,
    explorerScope,
    minRating,
    opponent,
    playerColor,
    selectedSpeeds,
    startDate,
    username,
  ]);

  useEffect(() => {
    if (!explorerOpen) return;

    if (explorerScope === "player" && !username.trim()) {
      setExplorerMoves([]);
      setRecentGames([]);
      setExplorerStatus("ready");
      setExplorerError("");
      return;
    }

    const abortController = new AbortController();
    let requestTimedOut = false;
    const requestTimeout = window.setTimeout(() => {
      requestTimedOut = true;
      abortController.abort();
    }, EXPLORER_REQUEST_TIMEOUT_MS);
    const selectedSpeedValues = SPEED_FILTERS.filter((speed) =>
      selectedSpeeds.includes(speed.key),
    ).map((speed) => speed.value);
    const params = new URLSearchParams({
      fen: currentFen,
      minRating: String(minRating),
      speeds: selectedSpeedValues.join(","),
    });
    if (MONTH_FILTER_PATTERN.test(startDate)) {
      params.set("startDate", startDate);
    }
    if (MONTH_FILTER_PATTERN.test(endDate)) {
      params.set("endDate", endDate);
    }
    const trimmedUsername = username.trim();
    if (explorerScope === "player" && trimmedUsername) {
      params.set("color", playerColor);
      params.set("username", trimmedUsername);
      const trimmedOpponent = opponent.trim();
      if (trimmedOpponent) {
        params.set("opponent", trimmedOpponent);
      }
    }

    setExplorerStatus("loading");
    setExplorerError("");
    setExplorerMoves([]);
    setRecentGames([]);

    const explorerApiUrl = `${appAssetPath("/api/opening-explorer")}?${params.toString()}`;

    fetch(explorerApiUrl, {
      signal: abortController.signal,
    })
      .then(async (response) => {
        const text = await response.text();
        let body: unknown = null;

        try {
          body = text ? JSON.parse(text) : [];
        } catch {
          const returnedHtml = text.trimStart().startsWith("<!doctype") || text.includes("<html");
          throw new Error(
            returnedHtml
              ? `Opening explorer API returned the app page from ${window.location.origin}${explorerApiUrl}. Open http://127.0.0.1:5180/analysis and hard-refresh.`
              : `Opening explorer API returned invalid JSON from ${window.location.origin}${explorerApiUrl}.`,
          );
        }

        if (!response.ok) {
          const errorBody = body as { error?: string } | null;
          throw new Error(errorBody?.error ?? "Opening explorer is unavailable");
        }

        if (
          !body ||
          typeof body !== "object" ||
          !Array.isArray((body as Partial<ExplorerApiResponse>).moves) ||
          !Array.isArray((body as Partial<ExplorerApiResponse>).recentGames)
        ) {
          throw new Error("Opening explorer API returned an unexpected response.");
        }

        return body as ExplorerApiResponse;
      })
      .then((data) => {
        setExplorerMoves(
          data.moves.map((row) =>
            toExplorerMove(row, currentFen, { scope: explorerScope, playerColor }),
          ),
        );
        setRecentGames(data.recentGames.map((row) => toExplorerGame(row, currentFen)));
        setExplorerStatus("ready");
      })
      .catch((error) => {
        if (abortController.signal.aborted && !requestTimedOut) return;
        setExplorerMoves([]);
        setRecentGames([]);
        setExplorerStatus("error");
        setExplorerError(
          requestTimedOut
            ? "Opening explorer took too long to respond. Try fewer filters or refresh."
            : error instanceof Error
              ? error.message
              : "Opening explorer failed",
        );
      })
      .finally(() => {
        window.clearTimeout(requestTimeout);
      });

    return () => {
      window.clearTimeout(requestTimeout);
      abortController.abort();
    };
  }, [
    currentFen,
    endDate,
    explorerOpen,
    explorerScope,
    minRating,
    opponent,
    playerColor,
    selectedSpeeds,
    startDate,
    username,
  ]);

  useEffect(() => {
    const handleAnalysisShortcut = (event: KeyboardEvent): void => {
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
      const isExplorerMoveShortcut = shortcutIndex !== null;

      if (
        (key !== "e" && key !== "f" && !isExplorerMoveShortcut) ||
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

      if (isExplorerMoveShortcut) {
        if (usernamePickerOpen || filtersOpen || !explorerOpen || explorerStatus !== "ready") {
          return;
        }

        const explorerMove = explorerMoves[shortcutIndex];
        if (!explorerMove) return;

        event.preventDefault();
        playExplorerMove(explorerMove.uci);
        return;
      }

      if (key === "e") {
        setExplorerOpen((open) => !open);
      } else {
        flipBoard();
      }
    };

    window.addEventListener("keydown", handleAnalysisShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleAnalysisShortcut, { capture: true });
  }, [explorerMoves, explorerOpen, explorerStatus, filtersOpen, flipBoard, usernamePickerOpen]);

  useEffect(() => {
    if (!usernamePickerOpen) return;

    const handlePickerShortcut = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeUsernamePicker();
      }
    };

    window.addEventListener("keydown", handlePickerShortcut);
    return () => window.removeEventListener("keydown", handlePickerShortcut);
  }, [usernamePickerOpen]);

  return (
    <section className="analysisPage" style={analysisPageStyle}>
      <Seo
        title="Analysis"
        description="Analyze atomic chess positions and browse opening explorer filters."
        path="/analysis"
      />

      <aside
        ref={rightPanelRef}
        className={`analysisPanel analysisRightPanel ${explorerOpen ? "explorerOpen" : "explorerCollapsed"} ${
          explorerResizing ? "explorerResizing" : ""
        }`}
        style={rightPanelStyle}
        aria-label="Analysis controls"
      >
        <div className="analysisMovePanel" ref={movePanelRef}>
          <div className="analysisSectionTitle">
            <span>Moves</span>
            <div className="analysisMoveSettings" ref={moveSettingsRef}>
              <button
                type="button"
                className="analysisMoveSettingsButton"
                aria-label="Moves settings"
                aria-haspopup="menu"
                aria-expanded={moveSettingsOpen}
                aria-controls="analysis-move-settings-menu"
                title="Moves settings"
                onClick={() => setMoveSettingsOpen((open) => !open)}
              >
                <FontAwesomeIcon icon={faGear} />
              </button>
              {moveSettingsOpen ? (
                <div
                  className="analysisMoveSettingsMenu"
                  id="analysis-move-settings-menu"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      flipBoard();
                      setMoveSettingsOpen(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faArrowsRotate} />
                    <span>Flip board</span>
                  </button>
                </div>
              ) : null}
            </div>
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
            <button
              type="button"
              className="analysisExplorerResizeHandle"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize moves and opening explorer"
              title="Resize moves and opening explorer"
              onPointerDown={handleExplorerResizePointerDown}
              onKeyDown={handleExplorerResizeKeyDown}
            />
            <div className="analysisExplorerCompactHeader">
              <div
                className="analysisExplorerTabs"
                role="tablist"
                aria-label="Opening explorer source"
              >
                <button
                  type="button"
                  role="tab"
                  className={explorerScope === "general" ? "active" : ""}
                  aria-selected={explorerScope === "general"}
                  onClick={() => {
                    setExplorerScope("general");
                    setStartDate("");
                    setFiltersOpen(false);
                  }}
                >
                  <FontAwesomeIcon icon={faBookOpen} />
                  <span>General</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  className={explorerScope === "player" ? "active" : ""}
                  aria-selected={explorerScope === "player"}
                  aria-label={`${username.trim() || "Player"}${
                    opponent.trim() ? ` vs ${opponent.trim()}` : ""
                  } as ${playerColor}`}
                  onClick={(event) =>
                    showPlayerExplorer(event.currentTarget.getAttribute("aria-selected") === "true")
                  }
                >
                  <span className="analysisExplorerPlayerLabel">
                    <span>
                      {username.trim() || "Player"}
                      {opponent.trim() ? ` vs ${opponent.trim()}` : ""}
                    </span>
                    <small>as {playerColor}</small>
                  </span>
                </button>
              </div>
              <button
                type="button"
                className={`analysisFilterToggle ${filtersOpen ? "open" : ""}`}
                aria-expanded={filtersOpen}
                aria-controls="analysis-explorer-filters"
                aria-label={
                  filtersOpen ? "Close opening explorer settings" : "Opening explorer settings"
                }
                title={filtersOpen ? "Close settings" : "Opening explorer settings"}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <FontAwesomeIcon icon={filtersOpen ? faXmark : faGear} />
              </button>
            </div>

            {filtersOpen ? (
              <div className="analysisFilterPanel" id="analysis-explorer-filters">
                {explorerScope === "player" ? (
                  <div className="analysisPlayerSettings">
                    <span>Player</span>
                    <div className="analysisPlayerSettingsRow">
                      <button
                        type="button"
                        className="analysisPlayerNameButton"
                        onClick={() => openUsernamePicker("player")}
                      >
                        {username.trim() || "Choose player"}
                      </button>
                      <button
                        type="button"
                        className="analysisPlayerSideButton"
                        aria-label={`Switch to ${playerColor === "white" ? "black" : "white"}`}
                        title="Switch sides"
                        onClick={switchPlayerColor}
                      >
                        <FontAwesomeIcon icon={faArrowsRotate} />
                        <span>as {playerColor}</span>
                      </button>
                    </div>
                    <div className="analysisOpponentField">
                      <span>Opponent</span>
                      <div className="analysisOpponentFieldRow">
                        <button
                          type="button"
                          className="analysisPlayerNameButton"
                          onClick={() => openUsernamePicker("opponent")}
                        >
                          {opponent.trim() || "Choose opponent"}
                        </button>
                        {opponent.trim() ? (
                          <button
                            type="button"
                            className="analysisOpponentClearButton"
                            aria-label="Clear opponent"
                            title="Clear opponent"
                            onClick={() => setOpponent("")}
                          >
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="analysisFilterGroup">
                  <span>Speed</span>
                  <div className="analysisSpeedToggles" aria-label="Speed filters">
                    {SPEED_FILTERS.map((speed) => (
                      <button
                        key={speed.key}
                        type="button"
                        className={selectedSpeeds.includes(speed.key) ? "active" : ""}
                        aria-label={speed.label}
                        aria-pressed={selectedSpeeds.includes(speed.key)}
                        title={speed.label}
                        onClick={() => toggleSpeed(speed.key)}
                      >
                        <SpeedFilterIcon speed={speed.key} />
                      </button>
                    ))}
                  </div>
                </div>
                <label className="analysisRatingSlider">
                  <span>
                    {explorerScope === "player" ? "Min opponent rating" : "Min average rating"}
                  </span>
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
                <div className="analysisDateFilters">
                  <label>
                    <span>Since</span>
                    <input
                      type="text"
                      value={startDate}
                      inputMode="numeric"
                      maxLength={7}
                      pattern="\d{4}-\d{2}"
                      placeholder="YYYY-MM"
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Until</span>
                    <input
                      type="text"
                      value={endDate}
                      inputMode="numeric"
                      maxLength={7}
                      pattern="\d{4}-\d{2}"
                      placeholder="YYYY-MM"
                      onChange={(event) => setEndDate(event.target.value)}
                    />
                  </label>
                </div>
                <div className="analysisExplorerToolbar">
                  <button
                    type="button"
                    className="analysisPrimaryButton"
                    onClick={() => setFiltersOpen(false)}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}

            {showExplorerResults ? (
              <div className="analysisExplorerTableWrap">
                <table className="analysisExplorerTable">
                  <thead>
                    <tr>
                      <th>Move</th>
                      <th>Games</th>
                      {explorerScope === "player" ? <th>Perf</th> : null}
                      <th>Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explorerStatus === "loading" ? (
                      <tr>
                        <td colSpan={explorerColumnCount} className="analysisExplorerState">
                          Loading database moves...
                        </td>
                      </tr>
                    ) : null}
                    {explorerStatus === "error" ? (
                      <tr>
                        <td colSpan={explorerColumnCount} className="analysisExplorerState">
                          {explorerError}
                        </td>
                      </tr>
                    ) : null}
                    {explorerStatus === "ready" && explorerMoves.length === 0 ? (
                      <tr>
                        <td colSpan={explorerColumnCount} className="analysisExplorerState">
                          {explorerScope === "player" && !username.trim()
                            ? "Enter a username for player explorer."
                            : "No database games for this position."}
                        </td>
                      </tr>
                    ) : null}
                    {explorerMoves.map((row) => (
                      <tr
                        key={row.uci}
                        className="analysisExplorerRow"
                        role="button"
                        tabIndex={0}
                        aria-label={`Play ${row.move}`}
                        onClick={() => playExplorerMove(row.uci)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          playExplorerMove(row.uci);
                        }}
                      >
                        <td>
                          <span className="analysisExplorerMove">{row.move}</span>
                        </td>
                        <td>{row.gamesLabel}</td>
                        {explorerScope === "player" ? (
                          <td
                            className="analysisPerformanceCell"
                            title={
                              row.performanceRating
                                ? `Performance rating estimate: ${row.performanceRating}`
                                : "Performance rating unavailable"
                            }
                          >
                            {row.performanceRating ?? "-"}
                          </td>
                        ) : null}
                        <td>
                          <div
                            className="analysisWinRateBar"
                            title={
                              row.avgOpponentRating
                                ? `Average opponent rating: ${row.avgOpponentRating}`
                                : "Average opponent rating unavailable"
                            }
                            style={
                              {
                                "--white-rate": `${row.white}%`,
                                "--draw-rate": `${row.draw}%`,
                                "--black-rate": `${row.black}%`,
                              } as CSSProperties
                            }
                            aria-label={`White ${row.white}%, draw ${row.draw}%, black ${row.black}%, average opponent rating ${row.avgOpponentRating ?? "unavailable"}`}
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
                  {explorerStatus === "ready" && explorerMoves.length > 0 ? (
                    <tfoot>
                      <tr className="analysisExplorerSummaryRow">
                        <td>
                          <span className="analysisExplorerSummaryMove">Σ</span>
                        </td>
                        <td>{formatGameCount(explorerSummary.games)}</td>
                        {explorerScope === "player" ? <td>-</td> : null}
                        <td>
                          <div
                            className="analysisWinRateBar analysisSummaryWinRateBar"
                            title={`Shown moves: ${explorerSummaryWhite}% white, ${explorerSummaryDraw}% draw, ${explorerSummaryBlack}% black`}
                            style={
                              {
                                "--white-rate": `${explorerSummaryWhite}%`,
                                "--draw-rate": `${explorerSummaryDraw}%`,
                                "--black-rate": `${explorerSummaryBlack}%`,
                              } as CSSProperties
                            }
                            aria-label={`Shown moves: white ${explorerSummaryWhite}%, draw ${explorerSummaryDraw}%, black ${explorerSummaryBlack}%`}
                          >
                            <span
                              className="white"
                              aria-hidden={explorerSummaryWhite < WIN_RATE_LABEL_MIN_PERCENT}
                            >
                              {visibleWinRateLabel(explorerSummaryWhite)}
                            </span>
                            <span
                              className="draw"
                              aria-hidden={explorerSummaryDraw < WIN_RATE_LABEL_MIN_PERCENT}
                            >
                              {visibleWinRateLabel(explorerSummaryDraw)}
                            </span>
                            <span
                              className="black"
                              aria-hidden={explorerSummaryBlack < WIN_RATE_LABEL_MIN_PERCENT}
                            >
                              {visibleWinRateLabel(explorerSummaryBlack)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>

                {explorerStatus === "ready" && recentGames.length > 0 ? (
                  <div className="analysisRecentGames" aria-label="Recent games">
                    <span>Recent games</span>
                    <ol>
                      {recentGames.map((game) => (
                        <li key={game.gameId}>
                          <a
                            href={`https://lichess.org/${game.gameId}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`${game.whiteName} vs ${game.blackName}`}
                          >
                            <span className="analysisRecentRatings">
                              <span>{game.whiteRating ?? "-"}</span>
                              <span>{game.blackRating ?? "-"}</span>
                            </span>
                            <span className="analysisRecentPlayers">
                              <span>{game.whiteName}</span>
                              <span>{game.blackName}</span>
                            </span>
                            <span className={`analysisRecentResult ${game.resultClass}`}>
                              {game.result}
                            </span>
                            <span className="analysisRecentDate">{game.playedOn.slice(0, 7)}</span>
                            <span className="analysisRecentMove">{game.move}</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : null}
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
            aria-labelledby="analysis-username-picker-title"
          >
            <button
              type="button"
              className="analysisUsernamePickerClose"
              aria-label="Close username picker"
              onClick={closeUsernamePicker}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
            <h2 id="analysis-username-picker-title">
              {usernamePickerTarget === "opponent" ? "Choose opponent" : "Choose player"}
            </h2>
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
                        (usernamePickerTarget === "opponent" ? opponent : username)
                          .trim()
                          .toLowerCase() === recentUsername.toLowerCase()
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

      <div className="analysisBoardColumn">
        <div
          ref={boardPanelRef}
          className="analysisBoardPanel"
          aria-label="Atomic chess board"
          tabIndex={0}
        >
          <Chessboard
            puzzleId="analysis"
            fen={rootFen}
            orientation={orientation}
            coordinates
            solution=""
            showSolution={false}
            analysisMode
            solutionNavigation={navigation}
            onNavigateHandled={() => setNavigation(null)}
            onStateChange={setBoardState}
          />
          <button
            type="button"
            className="analysisBoardResizeHandle"
            aria-label="Resize analysis board"
            title="Resize board"
            onPointerDown={handleBoardResizePointerDown}
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
                setActiveTextEditor("fen");
              }}
              onBlur={(event) => commitFenDraft(event.currentTarget.value)}
              onKeyDown={handleFenKeyDown}
              onChange={(event) => {
                fenDraftDirtyRef.current = true;
                setFenDraft(event.target.value);
              }}
            />
            {fenError ? <small className="analysisTextBoxError">{fenError}</small> : null}
          </div>
          <div className="analysisPgnBox analysisTextBox" aria-label="PGN">
            <span>PGN</span>
            <textarea
              value={pgnDraft}
              rows={3}
              spellCheck={false}
              aria-label="PGN"
              aria-invalid={Boolean(pgnError)}
              onFocus={() => {
                pgnDraftDirtyRef.current = false;
                setActiveTextEditor("pgn");
              }}
              onBlur={(event) => commitPgnDraft(event.currentTarget.value)}
              onKeyDown={handlePgnKeyDown}
              onChange={(event) => {
                pgnDraftDirtyRef.current = true;
                setPgnDraft(event.target.value);
              }}
            />
            {pgnError ? <small className="analysisTextBoxError">{pgnError}</small> : null}
          </div>
        </div>
      </div>
    </section>
  );
};
