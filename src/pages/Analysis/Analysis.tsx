import "./Analysis.css";

import {
  faArrowsRotate,
  faBookOpen,
  faExternalLinkAlt,
  faGear,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import {
  OpeningDatabaseDisplay,
  type OpeningDatabaseGame,
  type OpeningDatabaseMove,
} from "../../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";
import { PlaybackButtons } from "../../components/PlaybackButtons/PlaybackButtons";
import { pairPlayedMoves, PlayedMoves } from "../../components/PlayedMoves/PlayedMoves";
import { Seo } from "../../components/Seo/Seo";
import { UsernamePickerModal } from "../../components/UsernamePickerModal/UsernamePickerModal";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { createAtomicPosition } from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatGameCount } from "../../utils/formatters";
import { lichessAtomicAnalysisUrl } from "../../utils/lichess";
import { toOpeningDatabaseGame, toOpeningDatabaseMove } from "../../utils/openingDatabaseDisplay";
import {
  type ExplorerApiMove,
  type ExplorerApiPositionLeader,
  type ExplorerApiPositionLeaders,
  type ExplorerApiResponse,
  fetchExplorerApiResponse,
} from "../../utils/openingExplorer";
import {
  addRecentUsername,
  loadRecentUsernames,
  removeRecentUsername as removeRecentUsernameFromList,
  storeRecentUsernames,
} from "../../utils/recentUsernames";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIN_MOVE_PANEL_HEIGHT = 86;
const MIN_EXPLORER_PANEL_HEIGHT = 220;
const EXPLORER_RESIZE_STEP = 24;

type ExplorerMove = OpeningDatabaseMove;

type ExplorerGame = OpeningDatabaseGame;

type ExplorerPositionLeader = ExplorerApiPositionLeader & {
  share: number;
  gamesLabel: string;
};

type ExplorerPositionLeaders = {
  sideLabel: "White" | "Black";
  totalGamesLabel: string;
  leaders: ExplorerPositionLeader[];
};

type ExplorerStatus = "idle" | "loading" | "ready" | "error";
type ExplorerScope = "general" | "player";
type ExplorerSpeed = "bullet" | "blitz" | "hyperbullet";
type ExplorerSpeedValue = 0 | 1 | 2;
type UsernamePickerTarget = "player" | "opponent";
type ExplorerRequestOptions = {
  fen: string;
  playerMinRating: number;
  selectedSpeeds: ExplorerSpeed[];
  startDate: string;
  endDate: string;
  scope: ExplorerScope;
  playerColor: "white" | "black";
  username: string;
  opponent: string;
};

const EXPLORER_REQUEST_TIMEOUT_MS = 15_000;
const MONTH_FILTER_PATTERN = /^\d{4}-\d{2}$/;
const EXPLORER_SETTINGS_STORAGE_KEY = "atomic-puzzles.analysis.explorer-settings";
const BOARD_SIZE_STORAGE_KEY = "atomic-puzzles.analysis.board-size";
const DEFAULT_ANALYSIS_BOARD_SIZE = 516;
const MIN_ANALYSIS_BOARD_SIZE = 320;
const MAX_ANALYSIS_BOARD_SIZE = 760;
const ANALYSIS_DESKTOP_RESERVED_WIDTH = 430;
const DEFAULT_PLAYER_START_DATE = "2025-01";
const SPEED_FILTERS: Array<{ key: ExplorerSpeed; label: string; value: ExplorerSpeedValue }> = [
  { key: "hyperbullet", label: "Hyper", value: 2 },
  { key: "bullet", label: "Bullet", value: 0 },
  { key: "blitz", label: "Blitz", value: 1 },
];
const EXPLORER_SPEED_KEYS = SPEED_FILTERS.map((speed) => speed.key);
const EXPLORER_SPEED_FILTER_VERSION = 2;
const PLAYER_MIN_RATING = 1700;
const MAX_EXPLORER_RATING = 2200;
const PLAYER_RATING_STEP = 50;

const DEFAULT_EXPLORER_SETTINGS = {
  speedFilterVersion: EXPLORER_SPEED_FILTER_VERSION,
  explorerScope: "general" as ExplorerScope,
  playerColor: "white" as "white" | "black",
  selectedSpeeds: ["bullet", "blitz", "hyperbullet"] as ExplorerSpeed[],
  minRating: PLAYER_MIN_RATING,
  generalStartDate: "",
  playerStartDate: DEFAULT_PLAYER_START_DATE,
  endDate: "",
  username: "",
  opponent: "",
  showPositionLeaders: true,
};

type StoredExplorerSettings = typeof DEFAULT_EXPLORER_SETTINGS;

const clampRating = (rating: number): number =>
  Math.max(
    PLAYER_MIN_RATING,
    Math.min(MAX_EXPLORER_RATING, Number.isFinite(rating) ? rating : PLAYER_MIN_RATING),
  );

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

const getPlayerStartDate = (currentStartDate: string): string =>
  validMonthFilter(currentStartDate) || DEFAULT_PLAYER_START_DATE;

const normalizeStoredSpeeds = (value: unknown, speedFilterVersion: unknown): ExplorerSpeed[] => {
  if (!Array.isArray(value)) return DEFAULT_EXPLORER_SETTINGS.selectedSpeeds;

  const speeds = value.filter((speed): speed is ExplorerSpeed =>
    EXPLORER_SPEED_KEYS.includes(speed as ExplorerSpeed),
  );
  const uniqueSpeeds = [...new Set(speeds)];

  if (
    speedFilterVersion !== EXPLORER_SPEED_FILTER_VERSION &&
    uniqueSpeeds.length === 2 &&
    uniqueSpeeds.includes("bullet") &&
    uniqueSpeeds.includes("blitz")
  ) {
    return DEFAULT_EXPLORER_SETTINGS.selectedSpeeds;
  }

  return uniqueSpeeds.length ? uniqueSpeeds : DEFAULT_EXPLORER_SETTINGS.selectedSpeeds;
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
    const legacyStartDate = validMonthFilter(
      (rawSettings as Partial<StoredExplorerSettings> & { startDate?: unknown }).startDate,
    );
    const generalStartDate =
      validMonthFilter(rawSettings.generalStartDate) ||
      (explorerScope === "general" ? legacyStartDate : "");
    const playerStartDate =
      validMonthFilter(rawSettings.playerStartDate) ||
      (explorerScope === "player" ? legacyStartDate : "") ||
      DEFAULT_PLAYER_START_DATE;

    return {
      speedFilterVersion: EXPLORER_SPEED_FILTER_VERSION,
      explorerScope,
      playerColor,
      selectedSpeeds: normalizeStoredSpeeds(
        rawSettings.selectedSpeeds,
        rawSettings.speedFilterVersion,
      ),
      minRating: clampRating(Number(rawSettings.minRating)),
      generalStartDate,
      playerStartDate,
      endDate: validMonthFilter(rawSettings.endDate),
      username: String(rawSettings.username ?? "").trim(),
      opponent: String(rawSettings.opponent ?? "").trim(),
      showPositionLeaders: rawSettings.showPositionLeaders !== false,
    };
  } catch {
    return DEFAULT_EXPLORER_SETTINGS;
  }
};

const storeExplorerSettings = (settings: StoredExplorerSettings): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(EXPLORER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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

const buildExplorerApiUrl = ({
  fen,
  playerMinRating,
  selectedSpeeds,
  startDate,
  endDate,
  scope,
  playerColor,
  username,
  opponent,
}: ExplorerRequestOptions): string => {
  const selectedSpeedValues = SPEED_FILTERS.filter((speed) =>
    selectedSpeeds.includes(speed.key),
  ).map((speed) => speed.value);
  const params = new URLSearchParams({
    fen,
    speeds: selectedSpeedValues.join(","),
  });

  if (MONTH_FILTER_PATTERN.test(startDate)) {
    params.set("startDate", startDate);
  }

  if (MONTH_FILTER_PATTERN.test(endDate)) {
    params.set("endDate", endDate);
  }

  const trimmedUsername = username.trim();
  if (scope === "player" && trimmedUsername) {
    params.set("color", playerColor);
    params.set("minRating", String(playerMinRating));
    params.set("username", trimmedUsername);

    const trimmedOpponent = opponent.trim();
    if (trimmedOpponent) {
      params.set("opponent", trimmedOpponent);
    }
  }

  return `${appAssetPath("/api/opening-explorer")}?${params.toString()}`;
};

const SpeedFilterIcon = ({ speed }: { speed: ExplorerSpeed }) => {
  if (speed === "bullet") {
    return (
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
    );
  }

  if (speed === "blitz") {
    return (
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
  }

  return (
    <svg
      className="analysisSpeedIcon hyper"
      viewBox="0 0 36 28"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="hyperBoltSecondary"
        d="M7.8 2.8h11.4l-6.1 8.4h7.4L5.7 25.2l3.5-10.5H2.8L7.8 2.8Z"
      />
      <path
        className="hyperBoltPrimary"
        d="M20 1.7h12.8l-7 9.5h8.4L16.8 26.5l4.1-11.8h-7.2L20 1.7Z"
      />
    </svg>
  );
};

const formatWholePercent = (value: number): string => `${Math.round(value)}%`;

const sideLabelFromColor = (color: number): "White" | "Black" | null => {
  if (color === 0) return "White";
  if (color === 1) return "Black";
  return null;
};

const toExplorerMove = (
  row: ExplorerApiMove,
  fen: string,
  options: { scope: ExplorerScope; playerColor: "white" | "black" },
): ExplorerMove =>
  toOpeningDatabaseMove(row, fen, {
    showPerformance: options.scope === "player",
    playerColor: options.playerColor,
  });

const toExplorerPositionLeaders = (
  value: ExplorerApiPositionLeaders | null | undefined,
): ExplorerPositionLeaders | null => {
  if (!value || !Number.isFinite(value.totalGames) || value.totalGames <= 0) return null;
  if (!Array.isArray(value.leaders) || value.leaders.length === 0) return null;
  const sideLabel = sideLabelFromColor(Number(value.lastMoveColor));
  if (!sideLabel) return null;

  const leaders = value.leaders
    .map((leader) => {
      const username = String(leader.username ?? "").trim();
      const games = Number(leader.games);
      if (!username || !Number.isFinite(games) || games <= 0) return null;

      return {
        username,
        games,
        gamesLabel: formatGameCount(games),
        share: Math.max(0, Math.min(100, (games / value.totalGames) * 100)),
      };
    })
    .filter((leader): leader is ExplorerPositionLeader => leader !== null);

  if (!leaders.length) return null;

  return {
    sideLabel,
    totalGamesLabel: formatGameCount(value.totalGames),
    leaders,
  };
};

export const AnalysisPage = () => {
  const [initialExplorerSettings] = useState(loadExplorerSettings);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const movePanelRef = useRef<HTMLDivElement | null>(null);
  const moveSettingsRef = useRef<HTMLDivElement | null>(null);
  const fenDraftDirtyRef = useRef(false);
  const pgnDraftDirtyRef = useRef(false);
  const explorerRequestIdRef = useRef(0);
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
  const [generalStartDate, setGeneralStartDate] = useState(
    initialExplorerSettings.generalStartDate,
  );
  const [playerStartDate, setPlayerStartDate] = useState(initialExplorerSettings.playerStartDate);
  const [endDate, setEndDate] = useState(initialExplorerSettings.endDate);
  const [username, setUsername] = useState(initialExplorerSettings.username);
  const [opponent, setOpponent] = useState(initialExplorerSettings.opponent);
  const [showPositionLeaders, setShowPositionLeaders] = useState(
    initialExplorerSettings.showPositionLeaders,
  );
  const [usernamePickerOpen, setUsernamePickerOpen] = useState(false);
  const [usernamePickerTarget, setUsernamePickerTarget] = useState<UsernamePickerTarget>("player");
  const [recentUsernames, setRecentUsernames] = useState<string[]>(loadRecentUsernames);
  const [explorerMoves, setExplorerMoves] = useState<ExplorerMove[]>([]);
  const [recentGames, setRecentGames] = useState<ExplorerGame[]>([]);
  const [positionLeaders, setPositionLeaders] = useState<ExplorerPositionLeaders | null>(null);
  const [explorerStatus, setExplorerStatus] = useState<ExplorerStatus>("idle");
  const [explorerError, setExplorerError] = useState("");
  const [hoveredExplorerMoveUci, setHoveredExplorerMoveUci] = useState<string | null>(null);

  const moveList = boardState?.lineMoves ?? [];
  const currentFen = boardState?.fen || STARTING_FEN;
  const currentLichessAnalysisUrl = lichessAtomicAnalysisUrl(currentFen);
  const currentPly = boardState?.lineIndex ?? 0;
  const analysisPageStyle = {
    "--analysis-board-size": `${boardSize}px`,
  } as CSSProperties;
  const canStepBack = currentPly > 0;
  const canStepForward = currentPly < moveList.length;
  const showExplorerResults = !filtersOpen;
  const playerRatingValue = clampRating(minRating);
  const activeStartDate = explorerScope === "player" ? playerStartDate : generalStartDate;
  const rightPanelStyle =
    explorerOpen && movePanelHeight !== null
      ? ({ "--analysis-move-panel-height": `${movePanelHeight}px` } as CSSProperties)
      : undefined;

  const movePairs = pairPlayedMoves(moveList);

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

  const requestNavigation = (command: PlaybackCommand): void => {
    setNavigation({ type: "command", command });
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

  const requestBoardWheelNavigation = useCallback(
    (command: "next" | "previous"): void => setNavigation({ type: "command", command }),
    [],
  );

  useBoardWheelNavigation({
    boardPanelRef,
    canStepBack,
    canStepForward,
    onNavigate: requestBoardWheelNavigation,
  });

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
    setNavigation({ type: "history", ply: plyIndex });
  };

  const playExplorerMove = (uci: string): void => {
    setHoveredExplorerMoveUci(null);
    setNavigation({ type: "play", uci });
  };

  const clearExplorerResults = useCallback((): void => {
    setExplorerMoves([]);
    setRecentGames([]);
    setPositionLeaders(null);
  }, []);

  const ensurePlayerStartDate = useCallback((): void => {
    setPlayerStartDate(getPlayerStartDate);
  }, []);

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
    setNavigation({ type: "reset", fen: nextFen });
  };

  const commitPgnDraft = (draft = pgnDraft, force = false): void => {
    if (!force && !pgnDraftDirtyRef.current) {
      setPgnError("");
      setActiveTextEditor(null);
      return;
    }

    setPgnError("");
    setNavigation({ type: "loadPgn", pgn: draft, fen: rootFen });
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
  };

  const openUsernamePicker = (target: UsernamePickerTarget): void => {
    setUsernamePickerTarget(target);
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

    setExplorerScope("player");
    ensurePlayerStartDate();
    setFiltersOpen(false);
    saveRecentUsernames(addRecentUsername(recentUsernames, trimmedUsername));
    closeUsernamePicker();
  };

  const removeRecentUsername = (usernameToRemove: string): void => {
    saveRecentUsernames(removeRecentUsernameFromList(recentUsernames, usernameToRemove));
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
    ensurePlayerStartDate();
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

  const applyExplorerResponse = useCallback(
    (data: ExplorerApiResponse, fen: string, scope: ExplorerScope, color: "white" | "black") => {
      setExplorerMoves(
        data.moves.map((row) => toExplorerMove(row, fen, { scope, playerColor: color })),
      );
      setRecentGames(data.recentGames.map((row) => toOpeningDatabaseGame(row, fen)));
      setPositionLeaders(
        scope === "general" && showPositionLeaders
          ? toExplorerPositionLeaders(data.positionLeaders)
          : null,
      );
      setExplorerStatus("ready");
    },
    [showPositionLeaders],
  );

  useEffect(() => {
    storeExplorerSettings({
      speedFilterVersion: EXPLORER_SPEED_FILTER_VERSION,
      explorerScope,
      playerColor,
      selectedSpeeds,
      minRating,
      generalStartDate,
      playerStartDate,
      endDate,
      username,
      opponent,
      showPositionLeaders,
    });
  }, [
    endDate,
    explorerScope,
    generalStartDate,
    minRating,
    opponent,
    playerColor,
    playerStartDate,
    selectedSpeeds,
    showPositionLeaders,
    username,
  ]);

  useEffect(() => {
    if (!explorerOpen) return;

    const requestId = explorerRequestIdRef.current + 1;
    explorerRequestIdRef.current = requestId;

    if (explorerScope === "player" && !username.trim()) {
      clearExplorerResults();
      setExplorerStatus("ready");
      setExplorerError("");
      return;
    }

    const explorerApiUrl = buildExplorerApiUrl({
      fen: currentFen,
      playerMinRating: playerRatingValue,
      selectedSpeeds,
      startDate: activeStartDate,
      endDate,
      scope: explorerScope,
      playerColor,
      username,
      opponent,
    });

    let requestCancelled = false;
    let requestTimedOut = false;
    const requestTimeout = window.setTimeout(() => {
      requestTimedOut = true;
      if (!requestCancelled) {
        clearExplorerResults();
        setExplorerStatus("error");
        setExplorerError(
          "Opening explorer took too long to respond. Try fewer filters or refresh.",
        );
      }
    }, EXPLORER_REQUEST_TIMEOUT_MS);

    setExplorerStatus("loading");
    setExplorerError("");
    clearExplorerResults();

    fetchExplorerApiResponse(explorerApiUrl, "visible")
      .then((data) => {
        if (requestCancelled || requestTimedOut || requestId !== explorerRequestIdRef.current) {
          return;
        }
        applyExplorerResponse(data, currentFen, explorerScope, playerColor);
      })
      .catch((error) => {
        if (requestCancelled || requestTimedOut) return;
        clearExplorerResults();
        setExplorerStatus("error");
        setExplorerError(error instanceof Error ? error.message : "Opening explorer failed");
      })
      .finally(() => {
        window.clearTimeout(requestTimeout);
      });

    return () => {
      requestCancelled = true;
      window.clearTimeout(requestTimeout);
    };
  }, [
    applyExplorerResponse,
    clearExplorerResults,
    currentFen,
    endDate,
    explorerOpen,
    explorerScope,
    activeStartDate,
    playerRatingValue,
    opponent,
    playerColor,
    selectedSpeeds,
    username,
  ]);

  useEffect(() => {
    setHoveredExplorerMoveUci(null);
  }, [currentFen, explorerOpen, explorerStatus, filtersOpen]);

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
          <PlayedMoves moves={moveList} currentPly={currentPly} onNavigate={navigateToPly} />
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
                {explorerScope === "general" ? (
                  <label className="analysisToggleSetting">
                    <span>Position leaders</span>
                    <input
                      type="checkbox"
                      checked={showPositionLeaders}
                      onChange={(event) => setShowPositionLeaders(event.target.checked)}
                    />
                  </label>
                ) : null}
                {explorerScope === "player" ? (
                  <label className="analysisRatingSlider">
                    <span>Min opponent rating</span>
                    <output>{playerRatingValue}</output>
                    <input
                      type="range"
                      min={PLAYER_MIN_RATING}
                      max={MAX_EXPLORER_RATING}
                      step={PLAYER_RATING_STEP}
                      value={playerRatingValue}
                      onChange={(event) => setMinRating(Number(event.target.value))}
                    />
                  </label>
                ) : null}
                <div className="analysisDateFilters">
                  <label>
                    <span>Since</span>
                    <input
                      type="text"
                      value={activeStartDate}
                      inputMode="numeric"
                      maxLength={7}
                      pattern="\d{4}-\d{2}"
                      placeholder="YYYY-MM"
                      onChange={(event) => {
                        const nextStartDate = event.target.value;
                        if (explorerScope === "player") {
                          setPlayerStartDate(nextStartDate);
                        } else {
                          setGeneralStartDate(nextStartDate);
                        }
                      }}
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
                {explorerScope === "general" && explorerStatus === "ready" && positionLeaders ? (
                  <section className="analysisPositionLeaders" aria-label="Position leaders">
                    <div className="analysisPositionLeadersHeader">
                      <span>Position leaders</span>
                      <small>{positionLeaders.sideLabel}</small>
                      <strong>{positionLeaders.totalGamesLabel} games</strong>
                    </div>
                    <ol>
                      {positionLeaders.leaders.map((leader, index) => (
                        <li key={`position-leader-${index}-${leader.username}`}>
                          <span className="analysisPositionLeaderRank">{index + 1}</span>
                          <span className="analysisPositionLeaderName">{leader.username}</span>
                          <span className="analysisPositionLeaderGames">{leader.gamesLabel}</span>
                          <span
                            className="analysisPositionLeaderBar"
                            aria-label={`${leader.username}: ${leader.gamesLabel} games, ${formatWholePercent(
                              leader.share,
                            )} of games reaching this position`}
                          >
                            <span
                              style={{ "--leader-share": `${leader.share}%` } as CSSProperties}
                            />
                          </span>
                          <span className="analysisPositionLeaderShare">
                            {formatWholePercent(leader.share)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                <OpeningDatabaseDisplay
                  moves={explorerMoves}
                  recentGames={recentGames}
                  status={explorerStatus}
                  error={explorerError}
                  emptyMessage={
                    explorerScope === "player" && !username.trim()
                      ? "Enter a username for player explorer."
                      : "No database games for this position."
                  }
                  showPerformance={explorerScope === "player"}
                  orientation={orientation}
                  currentPly={currentPly}
                  onPlayMove={playExplorerMove}
                  onHoverMove={setHoveredExplorerMoveUci}
                />
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
          id="analysis-username-picker-title"
          title={usernamePickerTarget === "opponent" ? "Choose opponent" : "Choose player"}
          recentUsernames={recentUsernames}
          selectedUsernames={[
            (usernamePickerTarget === "opponent" ? opponent : username).trim(),
          ].filter(Boolean)}
          maxSelectedUsernames={1}
          submitLabel="Select"
          onClose={closeUsernamePicker}
          onSelectUsername={commitUsername}
          onRemoveRecentUsername={removeRecentUsername}
        />
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
            captureNavigationShortcuts
            solutionNavigation={navigation}
            previewMove={hoveredExplorerMoveUci}
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
