import { faArrowsRotate, faBookOpen, faGear, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { AtomicDbEvalBar } from "../../components/AtomicDbEngine/AtomicDbEngine";
import { BoardWorkspace } from "../../components/BoardWorkspace/BoardWorkspace";
import {
  isTextEntryTarget,
  shortcutIndexFromKeyboardEvent,
} from "../../components/Chessboard/boardShortcuts";
import { MoveNotation } from "../../components/MoveNotation/MoveNotation";
import { pairPlayedMoves } from "../../components/PlayedMoves/PlayedMoves";
import { Seo } from "../../components/Seo/Seo";
import { UsernamePickerModal } from "../../components/UsernamePickerModal/UsernamePickerModal";
import { useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { AnalysisToolbar } from "../../features/analysisWorkspace/AnalysisToolbar";
import {
  AnalysisWorkspaceLayout,
  AnalysisWorkspacePanel,
} from "../../features/analysisWorkspace/AnalysisWorkspaceLayout";
import { AtomicDbAnalysisBlock } from "../../features/analysisWorkspace/AtomicDbAnalysisBlock";
import {
  OpeningExplorerPanel,
  OpeningExplorerResizeHandle,
} from "../../features/analysisWorkspace/OpeningExplorerPanel";
import { useAtomicDbAnalysis } from "../../hooks/useAtomicDbAnalysis";
import { useAtomicDbBoardAnalysis } from "../../hooks/useAtomicDbBoardAnalysis";
import { useAtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { useBoardDocument } from "../../hooks/useBoardDocument";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { useGameAnalysis } from "../../hooks/useGameAnalysis";
import { useOpeningExplorer } from "../../hooks/useOpeningExplorer";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useUsernamePicker } from "../../hooks/useUsernamePicker";
import { buildBoardLoadNavigation, gamePlyFromHash } from "../../lib/analysis/boardLoading";
import {
  boardLineAnnotationNavigation,
  boardLineNavigation,
  getBoardMoveState,
} from "../../lib/analysis/boardState";
import { readAnalysisHandoff } from "../../lib/analysis/handoff";
import { type ArchiveGame, decodeGameResult } from "../../lib/archive/games";
import { isAtomicTablebasePosition } from "../../lib/atomicTablebase/material";
import {
  createAtomicPosition,
  prunePgnLinesFromMove,
  sameSolutionMove,
  serializeSanLinesToPgn,
} from "../../lib/chess/pgn";
import type { ChessboardState, PlaybackCommand, SolutionNavigation } from "../../types/chessboard";
import { atomicDbPositionUrl, requestAtomicDbAnalysis } from "../../utils/atomicDb";
import { selectSpacebarMove } from "../../utils/boardMoveSelection";
import { threatFenFromFen } from "../../utils/chessNotation";
import { getErrorMessage } from "../../utils/errors";
import { lichessAtomicAnalysisUrl } from "../../utils/lichess";
import {
  buildOpeningExplorerUrl,
  type ExplorerRequestNavigation,
  fetchExplorerApiResponse,
} from "../../utils/openingExplorer";
import {
  GameAnalysisHeader,
  GameBoardClock,
  GameMatchNavigation,
} from "../Game/GameAnalysisHeader";
import { GameComputerAnalysis, GameComputerAnalysisPlayers } from "../Game/GameComputerAnalysis";
import { GameUnderboard, type GameUnderboardTab } from "../Game/GameUnderboard";

const MIN_MOVE_PANEL_HEIGHT = 0;
const MIN_EXPLORER_PANEL_HEIGHT = 12;
const EXPLORER_RESIZE_STEP = 24;
const MIN_GAME_ANALYSIS_PANEL_HEIGHT = 440;
const DEFAULT_GAME_PANEL_OVERHANG = 32;

type ExplorerScope = "general" | "player";
type ExplorerSpeed = "bullet" | "blitz" | "hyperbullet";
type ExplorerSpeedValue = 0 | 1 | 2;
type UsernamePickerTarget = "player" | "opponent";
type AtomicDbRequestStatus =
  { state: "idle" } | { state: "requested" } | { state: "error"; message: string };
const MONTH_FILTER_PATTERN = /^\d{4}-\d{2}$/;
const EXPLORER_SETTINGS_STORAGE_KEY = "atomic-puzzles.analysis.explorer-settings";
const BOARD_SIZE_STORAGE_KEY = "atomic-puzzles.analysis.board-size";
const NOTATION_LAYOUT_STORAGE_KEY = "atomic-puzzles.analysis.notation-layout";
const EXPLORER_OPEN_STORAGE_KEY = "atomic-puzzles.analysis.explorer-open";
const DEFAULT_ANALYSIS_BOARD_SIZE = 516;
const MIN_ANALYSIS_BOARD_SIZE = 320;
const MAX_ANALYSIS_BOARD_SIZE = 920;
const ANALYSIS_DESKTOP_RESERVED_WIDTH = 430;
// The game layout compresses its side columns before stacking them. Reserving the old 700px
// made the board collapse while there was still ample horizontal room for all three columns.
const GAME_THREE_COLUMN_RESERVED_WIDTH = 620;
const GAME_TWO_COLUMN_RESERVED_WIDTH = 360;
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

const fenFromRoute = (value: string | undefined): string => {
  if (!value) return STARTING_FEN;

  const fen = value.replace(/^\/+/, "").replaceAll("_", " ");

  try {
    createAtomicPosition(fen);
    return fen;
  } catch {
    return STARTING_FEN;
  }
};

const analysisPathFromFen = (fen: string): string => `/analysis/${fen.replaceAll(" ", "_")}`;

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
};

type StoredExplorerSettings = typeof DEFAULT_EXPLORER_SETTINGS;

const gameExplorerSettings = (
  game: ArchiveGame,
  settings: StoredExplorerSettings,
): StoredExplorerSettings => {
  const { white } = decodeGameResult(game);
  return {
    ...settings,
    explorerScope: "player",
    playerColor: "white",
    username: white,
    opponent: "",
  };
};

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

const getMaxAnalysisBoardSize = (isGame = false): number => {
  if (typeof window === "undefined") return MAX_ANALYSIS_BOARD_SIZE;

  const viewportWidth = window.innerWidth;
  const singleColumn = window.matchMedia("(max-width: 799px) and (orientation: portrait)").matches;
  if (singleColumn) {
    return Math.max(MIN_ANALYSIS_BOARD_SIZE, Math.min(MAX_ANALYSIS_BOARD_SIZE, viewportWidth - 20));
  }

  if (isGame) {
    const reservedWidth =
      viewportWidth < 1260 ? GAME_TWO_COLUMN_RESERVED_WIDTH : GAME_THREE_COLUMN_RESERVED_WIDTH;
    return Math.max(
      MIN_ANALYSIS_BOARD_SIZE,
      Math.min(MAX_ANALYSIS_BOARD_SIZE, viewportWidth - reservedWidth),
    );
  }

  if (viewportWidth <= 980) {
    return Math.min(MAX_ANALYSIS_BOARD_SIZE, 720);
  }

  return Math.max(
    MIN_ANALYSIS_BOARD_SIZE,
    Math.min(MAX_ANALYSIS_BOARD_SIZE, viewportWidth - ANALYSIS_DESKTOP_RESERVED_WIDTH),
  );
};

const getResponsiveAnalysisBoardFloor = (viewportWidth: number, isGame = false): number => {
  const singleColumn =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 799px) and (orientation: portrait)").matches;
  if (singleColumn) return Math.max(MIN_ANALYSIS_BOARD_SIZE, viewportWidth - 20);
  if (viewportWidth >= 3000) return 820;
  if (viewportWidth >= 2400) return 760;
  if (viewportWidth >= 1800) return 680;
  if (viewportWidth >= 1600) return 640;
  if (viewportWidth >= 1080) return 600;
  if (!isGame && viewportWidth >= 800) {
    return Math.round(Math.max(380, Math.min(600, viewportWidth * 0.52)));
  }
  if (isGame && viewportWidth >= 781) {
    return Math.round(Math.max(380, viewportWidth * 0.48));
  }
  return MIN_ANALYSIS_BOARD_SIZE;
};

const defaultExplorerOpen = (): boolean =>
  typeof window === "undefined" ||
  !window.matchMedia("(max-width: 799px) and (orientation: portrait)").matches;

const boardSizeSchema = z.coerce
  .number()
  .positive()
  .transform((size) => clampAnalysisBoardSize(size, getMaxAnalysisBoardSize()));
const notationLayoutSchema = z.enum(["inline", "non-inline"]);

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

const explorerSettingsSchema = z
  .record(z.string(), z.unknown())
  .transform((rawSettings): StoredExplorerSettings => {
    const explorerScope = rawSettings.explorerScope === "player" ? "player" : "general";
    const playerColor = rawSettings.playerColor === "black" ? "black" : "white";
    const legacyStartDate = validMonthFilter(rawSettings.startDate);
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
    };
  });

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

type AnalysisPageProps = {
  game?: ArchiveGame;
  initialFen?: string;
  initialMoves?: string[];
};

export const AnalysisPage = ({ game, initialFen, initialMoves }: AnalysisPageProps = {}) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { gameExplorerOnLeft } = useAppSettings();
  const { _splat: fenPath } = useParams({ strict: false });
  const locationSearch = typeof window === "undefined" ? "" : window.location.search;
  const analysisHandoff = useMemo(
    () => (game ? null : readAnalysisHandoff(locationSearch)),
    [game, locationSearch],
  );
  const routeFen =
    game && initialFen ? initialFen : (analysisHandoff?.fen ?? fenFromRoute(fenPath));
  const initialBoardNavigation = useMemo(() => {
    if (game) {
      const moves = initialMoves ?? [];
      return buildBoardLoadNavigation({
        fen: routeFen,
        moves,
        ply:
          gamePlyFromHash(
            typeof window === "undefined" ? "" : window.location.hash,
            moves.length,
          ) ?? 0,
      });
    }
    return buildBoardLoadNavigation({
      fen: routeFen,
      ...(analysisHandoff
        ? {
            pgn: analysisHandoff.pgn,
            line: analysisHandoff.line,
            ply: analysisHandoff.ply,
          }
        : {}),
    });
  }, [analysisHandoff, game, initialMoves, routeFen]);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const movePanelRef = useRef<HTMLDivElement | null>(null);
  const moveContentRef = useRef<HTMLDivElement | null>(null);
  const [boardState, setBoardState] = useState<ChessboardState | null>(null);
  const [atomicDbEngineSettings, setAtomicDbEngineSettings] = useAtomicDbEngineSettings();
  const [boardSize, setBoardSize] = usePersistedState(
    BOARD_SIZE_STORAGE_KEY,
    boardSizeSchema,
    DEFAULT_ANALYSIS_BOARD_SIZE,
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const [notationLayout, setNotationLayout] = usePersistedState(
    NOTATION_LAYOUT_STORAGE_KEY,
    notationLayoutSchema,
    "inline",
  );
  const [rootFen, setRootFen] = useState(routeFen);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = usePersistedState(
    EXPLORER_OPEN_STORAGE_KEY,
    z.boolean(),
    defaultExplorerOpen(),
  );
  const [movePanelHeight, setMovePanelHeight] = useState<number | null>(null);
  const [explorerResizing, setExplorerResizing] = useState(false);
  const [gamePanelHeight, setGamePanelHeight] = useState<number | null>(null);
  const [defaultGamePanelHeight, setDefaultGamePanelHeight] = useState<number | null>(null);
  const [gamePanelResizing, setGamePanelResizing] = useState(false);
  const [gameUnderboardTab, setGameUnderboardTab] = useState<GameUnderboardTab>("analysis");
  const [gameComputerAnalysisEnabled, setGameComputerAnalysisEnabled] = useState(true);
  const [persistedExplorerSettings, setPersistedExplorerSettings] =
    usePersistedState<StoredExplorerSettings>(
      EXPLORER_SETTINGS_STORAGE_KEY,
      explorerSettingsSchema,
      DEFAULT_EXPLORER_SETTINGS,
    );
  const [gameExplorerState, setGameExplorerState] = useState<{
    gameId: string;
    settings: StoredExplorerSettings;
  } | null>(null);
  const explorerSettings = game
    ? gameExplorerState?.gameId === game.game_id
      ? gameExplorerState.settings
      : gameExplorerSettings(game, persistedExplorerSettings)
    : persistedExplorerSettings;
  const setExplorerSettings = useCallback(
    (update: SetStateAction<StoredExplorerSettings>): void => {
      if (!game) {
        setPersistedExplorerSettings(update);
        return;
      }

      setGameExplorerState((current) => {
        const currentSettings =
          current?.gameId === game.game_id
            ? current.settings
            : gameExplorerSettings(game, persistedExplorerSettings);
        return {
          gameId: game.game_id,
          settings: typeof update === "function" ? update(currentSettings) : update,
        };
      });
    },
    [game, persistedExplorerSettings, setPersistedExplorerSettings],
  );
  const {
    explorerScope,
    playerColor,
    selectedSpeeds,
    minRating,
    generalStartDate,
    playerStartDate,
    endDate,
    username,
    opponent,
  } = explorerSettings;
  const updateExplorerSettings = useCallback(
    (patch: Partial<StoredExplorerSettings>): void =>
      setExplorerSettings((current) => ({ ...current, ...patch })),
    [setExplorerSettings],
  );
  const {
    isOpen: usernamePickerOpen,
    target: usernamePickerTarget,
    recentUsernames,
    open: openPicker,
    close: closeUsernamePicker,
    remember: rememberUsername,
    removeRecent: removeRecentUsername,
  } = useUsernamePicker<UsernamePickerTarget>("player");
  const [hoveredExplorerMoveUci, setHoveredExplorerMoveUci] = useState<string | null>(null);
  const [threatMode, setThreatMode] = useState(false);
  const [atomicDbRequestStatus, setAtomicDbRequestStatus] = useState<AtomicDbRequestStatus>({
    state: "idle",
  });
  const currentFenRef = useRef(STARTING_FEN);
  const requestedAtomicDbFensRef = useRef(new Set<string>());

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
  } = getBoardMoveState(boardState, rootFen);
  const gameAnalysis = useGameAnalysis(game, rootFen, auth.user?.username ?? "");
  const positionAnalysisEnabled =
    atomicDbEngineSettings.enabled && (!game || gameComputerAnalysisEnabled);
  const gameAssessments = gameAnalysis.analysis?.result?.assessments ?? [];
  const currentAssessment = currentPly > 0 ? (gameAssessments[currentPly - 1] ?? null) : null;
  const currentVisibleAssessment =
    currentAssessment?.classification === "best" ? null : currentAssessment;
  currentFenRef.current = currentFen;
  const {
    analysis: atomicDbAnalysis,
    beginVariationPlayback,
    fen: atomicDbFen,
    finishVariationPlayback,
    variationPlaying: atomicDbLinePlaying,
  } = useAtomicDbBoardAnalysis({
    currentFen,
    enabled: positionAnalysisEnabled,
    atomicDbEnabled: atomicDbEngineSettings.atomicDbEnabled !== false,
    navigation,
    lineCount: atomicDbEngineSettings.lineCount,
    showFollowUpMoves: atomicDbEngineSettings.showFollowUpMoves,
    terminalOutcome,
    suspended: Boolean(game && gameAnalysis.isLoading),
  });
  const threatFen = useMemo(
    () => (terminalOutcome ? null : threatFenFromFen(currentFen)),
    [currentFen, terminalOutcome],
  );
  const threatAnalysis = useAtomicDbAnalysis(threatFen ?? currentFen, {
    debounceMs: 0,
    enabled: positionAnalysisEnabled && threatMode && threatFen !== null && !atomicDbLinePlaying,
    atomicDbEnabled: atomicDbEngineSettings.atomicDbEnabled !== false,
    fallbackToEngine: true,
    lineCount: atomicDbEngineSettings.lineCount,
    plyCount: 5,
    suspended: navigation !== null,
  });
  const effectiveThreatMode = threatMode && threatFen !== null;
  const threatMoveUci =
    effectiveThreatMode && threatAnalysis.result?.fen === threatFen
      ? (threatAnalysis.result.position?.bestMove ?? null)
      : null;
  const displayedAnalysis = effectiveThreatMode ? threatAnalysis : atomicDbAnalysis;
  const displayedAnalysisFen = effectiveThreatMode && threatFen ? threatFen : atomicDbFen;
  const atomicDbResultIsCurrent = atomicDbAnalysis.result?.fen === currentFen;
  const atomicDbPositionKey = atomicDbResultIsCurrent
    ? (atomicDbAnalysis.result?.position?.key ?? null)
    : null;
  const canRequestAtomicDbAnalysis =
    atomicDbEngineSettings.atomicDbEnabled !== false &&
    atomicDbResultIsCurrent &&
    !isAtomicTablebasePosition(currentFen) &&
    !atomicDbPositionKey &&
    atomicDbAnalysis.status !== "error" &&
    (atomicDbAnalysis.status === "ready" || atomicDbAnalysis.source === "engine") &&
    terminalOutcome === null;
  const currentLichessAnalysisUrl = lichessAtomicAnalysisUrl(currentFen);

  useEffect(() => {
    setAtomicDbRequestStatus({
      state: requestedAtomicDbFensRef.current.has(currentFen) ? "requested" : "idle",
    });
  }, [currentFen]);

  const handleAtomicDbRequest = async (): Promise<void> => {
    if (!canRequestAtomicDbAnalysis || atomicDbRequestStatus.state === "requested") {
      return;
    }

    const requestedFen = currentFen;
    requestedAtomicDbFensRef.current.add(requestedFen);
    // Optimistically acknowledge the click. AtomicDB can take several seconds to return a queue
    // receipt, but only_if_missing makes repeat-safe requests and failures still expose a retry.
    setAtomicDbRequestStatus({ state: "requested" });
    try {
      await requestAtomicDbAnalysis(requestedFen);
    } catch (error) {
      requestedAtomicDbFensRef.current.delete(requestedFen);
      if (currentFenRef.current === requestedFen) {
        setAtomicDbRequestStatus({
          state: "error",
          message: getErrorMessage(error, "Unable to request AtomicDB analysis."),
        });
      }
    }
  };
  const atomicDbHref = atomicDbPositionKey ? atomicDbPositionUrl(atomicDbPositionKey) : null;
  const atomicDbRequest = canRequestAtomicDbAnalysis
    ? {
        state: atomicDbRequestStatus.state,
        ...(atomicDbRequestStatus.state === "error"
          ? { message: atomicDbRequestStatus.message }
          : {}),
        onRequest: () => void handleAtomicDbRequest(),
      }
    : null;
  const responsiveBoardFloor = getResponsiveAnalysisBoardFloor(viewportWidth, Boolean(game));
  const displayedBoardSize = Math.min(
    Math.max(boardSize, responsiveBoardFloor),
    getMaxAnalysisBoardSize(Boolean(game)),
  );
  const analysisPageStyle = {
    "--analysis-board-size": game
      ? `min(${displayedBoardSize}px, calc(100dvh - var(--nav-height) - 88px))`
      : `min(${displayedBoardSize}px, calc(100dvh - var(--nav-height) - 44px))`,
  } as CSSProperties;
  const showExplorerResults = !filtersOpen;
  const playerRatingValue = clampRating(minRating);
  const activeStartDate = explorerScope === "player" ? playerStartDate : generalStartDate;
  const moveGameExplorerLeft = Boolean(game && gameExplorerOnLeft && viewportWidth >= 1260);
  const explorerInAnalysisPanel = explorerOpen && !moveGameExplorerLeft;
  const resolvedGamePanelHeight = gamePanelHeight ?? defaultGamePanelHeight;
  const rightPanelStyle = {
    ...(explorerInAnalysisPanel && movePanelHeight !== null
      ? { "--analysis-move-panel-height": `${movePanelHeight}px` }
      : {}),
    ...(game && resolvedGamePanelHeight !== null
      ? { "--game-analysis-panel-height": `${resolvedGamePanelHeight}px` }
      : {}),
  } as CSSProperties;
  const explorerSplitValue =
    movePanelHeight === null
      ? 32
      : Math.min(
          100,
          Math.round(
            (movePanelHeight / Math.max(1, rightPanelRef.current?.clientHeight ?? 1)) * 100,
          ),
        );

  const movePairs = pairPlayedMoves(moveList);

  useLayoutEffect(() => {
    if (currentPly <= 2 && moveContentRef.current) {
      moveContentRef.current.scrollTop = 0;
    }
  }, [currentPly, game?.game_id]);

  const variationPgn = analysisLines.length ? serializeSanLinesToPgn(rootFen, analysisLines) : "";

  useEffect(() => {
    if (!game || typeof ResizeObserver === "undefined") return;
    const workspace = rightPanelRef.current?.closest<HTMLElement>(".gameAnalysisPage");
    const boardColumn = workspace?.querySelector<HTMLElement>(".analysisBoardColumn");
    if (!boardColumn) return;

    const syncHeight = (): void =>
      setDefaultGamePanelHeight(
        Math.round(boardColumn.getBoundingClientRect().height + DEFAULT_GAME_PANEL_OVERHANG),
      );
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(boardColumn);
    return () => observer.disconnect();
  }, [game]);
  const pgnText = variationPgn
    ? `${variationPgn} *`
    : movePairs.length
      ? `${movePairs
          .map((pair) => {
            const whiteMove = pair.white ?? "";
            return pair.black
              ? `${pair.number}. ${whiteMove} ${pair.black}`
              : `${pair.number}. ${whiteMove}`;
          })
          .join(" ")} *`
      : "";
  const boardDocument = useBoardDocument({
    fen: currentFen,
    pgn: pgnText,
    boardState,
    pgnAfterFenCommit: () => "",
    onCommitFen: (nextFen) => {
      setRootFen(nextFen);
      setNavigation(buildBoardLoadNavigation({ fen: nextFen }));
      void navigate({ to: analysisPathFromFen(nextFen) });
    },
    onCommitPgn: (nextPgn, initialFen) => {
      const nextRootFen = initialFen ?? rootFen;
      if (initialFen) setRootFen(initialFen);
      setNavigation(buildBoardLoadNavigation({ fen: nextRootFen, pgn: nextPgn }));
    },
  });

  useEffect(() => {
    setRootFen(routeFen);
    if (!game) setOrientation(analysisHandoff?.orientation ?? "white");
    setNavigation(initialBoardNavigation);
  }, [analysisHandoff?.orientation, game, initialBoardNavigation, routeFen]);

  const requestNavigation = useCallback((command: PlaybackCommand): void => {
    setNavigation({ type: "command", command });
  }, []);

  const flipBoard = useCallback((): void => {
    setOrientation((current) => (current === "white" ? "black" : "white"));
  }, []);

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
    const handleWindowResize = (): void => {
      setViewportWidth(window.innerWidth);
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

      setBoardSize(
        clampAnalysisBoardSize(startSize + resizeDelta, getMaxAnalysisBoardSize(Boolean(game))),
      );
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

  const navigateToPly = useCallback((plyIndex: number): void => {
    setNavigation({ type: "history", ply: plyIndex });
  }, []);

  useEffect(() => {
    if (!game) return;
    const handleHashChange = (): void => {
      const hashPly = gamePlyFromHash(window.location.hash, game.moves?.length ?? 0);
      if (hashPly !== null && hashPly !== currentPly) navigateToPly(hashPly);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [currentPly, game, navigateToPly]);

  const navigateToAnalysisMove = useCallback(
    (lineIndex: number, moveIndex: number): void => {
      const target = lineTargets[lineIndex];
      if (target) setNavigation(boardLineNavigation(target, moveIndex + 1));
    },
    [lineTargets],
  );

  const annotateMove = useCallback(
    (lineIndex: number | undefined, moveIndex: number, annotation: string): void => {
      const target =
        lineIndex === undefined ? { source: "history" as const } : lineTargets[lineIndex];
      if (!target) return;
      const nextNavigation = boardLineAnnotationNavigation(target, moveIndex + 1, annotation);
      if (nextNavigation) setNavigation(nextNavigation);
    },
    [lineTargets],
  );

  const deleteMove = useCallback(
    (lineIndex: number, moveIndex: number): void => {
      const pruned = prunePgnLinesFromMove(analysisLines, lineIndex, moveIndex, sameSolutionMove);
      const pgn = serializeSanLinesToPgn(rootFen, pruned.lines);
      setNavigation(
        buildBoardLoadNavigation({
          fen: rootFen,
          pgn,
          line: pruned.lineIndex,
          ply: pruned.ply,
        }),
      );
    },
    [analysisLines, rootFen],
  );

  const playExplorerMove = (uci: string): void => {
    setHoveredExplorerMoveUci(null);
    setNavigation({ type: "play", uci });
  };

  const playAtomicDbLine = (ucis: string[]): void => {
    setHoveredExplorerMoveUci(null);
    beginVariationPlayback();
    setNavigation({ type: "line", ucis });
  };

  const handleNavigationHandled = useCallback((): void => {
    finishVariationPlayback();
    setNavigation(null);
  }, [finishVariationPlayback]);

  useEffect(() => {
    if (!game || navigation !== null) return;
    const moveNumber = Math.ceil(currentPly / 2);
    const hash = moveNumber > 0 ? `#${moveNumber}` : "";
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [currentPly, game, navigation]);

  const ensurePlayerStartDate = useCallback((): void => {
    setExplorerSettings((current) => ({
      ...current,
      playerStartDate: getPlayerStartDate(current.playerStartDate),
    }));
  }, [setExplorerSettings]);

  const clampMovePanelHeight = useCallback((nextHeight: number): number | null => {
    const panel = rightPanelRef.current;
    if (!panel) return null;

    const panelStyles = window.getComputedStyle(panel);
    const panelContentHeight =
      panel.clientHeight -
      (Number.parseFloat(panelStyles.paddingTop) || 0) -
      (Number.parseFloat(panelStyles.paddingBottom) || 0);
    const rowGap = Number.parseFloat(panelStyles.rowGap) || 0;
    const toolbar = panel.querySelector<HTMLElement>(".analysisBottomToolbar");
    const toolbarStyles = toolbar ? window.getComputedStyle(toolbar) : null;
    const toolbarOuterHeight = toolbar
      ? toolbar.getBoundingClientRect().height +
        (Number.parseFloat(toolbarStyles?.marginTop ?? "0") || 0) +
        (Number.parseFloat(toolbarStyles?.marginBottom ?? "0") || 0)
      : 0;
    const maxHeight = Math.max(
      MIN_MOVE_PANEL_HEIGHT,
      panelContentHeight - toolbarOuterHeight - rowGap * 2 - MIN_EXPLORER_PANEL_HEIGHT,
    );
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

  const handleExplorerResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
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

  const handleExplorerResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
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

  const gamePanelHeightBounds = useCallback((): { min: number; max: number } | null => {
    const panel = rightPanelRef.current;
    const workspace = panel?.closest<HTMLElement>(".gameAnalysisPage");
    const underboard = workspace?.querySelector<HTMLElement>(".gameUnderboard");
    if (!panel || !underboard) return null;

    const max = Math.max(
      MIN_GAME_ANALYSIS_PANEL_HEIGHT,
      Math.round(underboard.getBoundingClientRect().bottom - panel.getBoundingClientRect().top),
    );
    return { min: Math.min(MIN_GAME_ANALYSIS_PANEL_HEIGHT, max), max };
  }, []);

  const handleGamePanelResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const panel = rightPanelRef.current;
    const bounds = gamePanelHeightBounds();
    if (!panel || !bounds) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGamePanelResizing(true);

    const ownerDocument = event.currentTarget.ownerDocument;
    const startY = event.clientY;
    const startHeight = panel.getBoundingClientRect().height;
    const handlePointerMove = (pointerEvent: PointerEvent): void => {
      pointerEvent.preventDefault();
      const nextHeight = startHeight + pointerEvent.clientY - startY;
      setGamePanelHeight(Math.round(Math.min(Math.max(nextHeight, bounds.min), bounds.max)));
    };
    const handlePointerUp = (): void => {
      setGamePanelResizing(false);
      ownerDocument.removeEventListener("pointermove", handlePointerMove);
      ownerDocument.removeEventListener("pointerup", handlePointerUp);
      ownerDocument.removeEventListener("pointercancel", handlePointerUp);
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove);
    ownerDocument.addEventListener("pointerup", handlePointerUp);
    ownerDocument.addEventListener("pointercancel", handlePointerUp);
  };

  const handleGamePanelResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const panel = rightPanelRef.current;
    const bounds = gamePanelHeightBounds();
    if (!panel || !bounds) return;

    event.preventDefault();
    const currentHeight = gamePanelHeight ?? panel.getBoundingClientRect().height;
    const nextHeight =
      event.key === "Home"
        ? bounds.min
        : event.key === "End"
          ? bounds.max
          : currentHeight +
            (event.key === "ArrowDown" ? EXPLORER_RESIZE_STEP : -EXPLORER_RESIZE_STEP);
    setGamePanelHeight(Math.min(Math.max(nextHeight, bounds.min), bounds.max));
  };

  const openUsernamePicker = (target: UsernamePickerTarget): void => {
    openPicker(target);
  };

  const commitUsername = (nextUsername: string): void => {
    const trimmedUsername = nextUsername.trim();
    if (!trimmedUsername) return;
    const gamePlayers = game ? decodeGameResult(game) : null;
    const selectedGamePlayerColor = gamePlayers
      ? trimmedUsername.toLowerCase() === gamePlayers.white.toLowerCase()
        ? "white"
        : trimmedUsername.toLowerCase() === gamePlayers.black.toLowerCase()
          ? "black"
          : null
      : null;

    if (usernamePickerTarget === "opponent") {
      updateExplorerSettings({ opponent: trimmedUsername });
    } else {
      updateExplorerSettings({
        username: trimmedUsername,
        ...(selectedGamePlayerColor ? { playerColor: selectedGamePlayerColor } : {}),
      });
    }

    updateExplorerSettings({ explorerScope: "player" });
    ensurePlayerStartDate();
    setFiltersOpen(false);
    if (!selectedGamePlayerColor) rememberUsername(trimmedUsername);
    closeUsernamePicker();
  };

  const gamePlayerPresets = useMemo(() => {
    if (!game || usernamePickerTarget !== "player") return [];
    const { white, black } = decodeGameResult(game);
    const selectedUsername = username.trim().toLowerCase();
    return [
      { username: white, color: "white" as const },
      { username: black, color: "black" as const },
    ].sort(
      (left, right) =>
        Number(left.username.toLowerCase() === selectedUsername) -
        Number(right.username.toLowerCase() === selectedUsername),
    );
  }, [game, username, usernamePickerTarget]);

  const switchPlayerColor = (): void => {
    setExplorerSettings((current) => ({
      ...current,
      playerColor: current.playerColor === "white" ? "black" : "white",
    }));
  };

  const showPlayerExplorer = (playerTabWasSelected: boolean): void => {
    if (playerTabWasSelected && username.trim()) {
      switchPlayerColor();
      setFiltersOpen(false);
      return;
    }

    updateExplorerSettings({ explorerScope: "player" });
    ensurePlayerStartDate();
    if (username.trim()) {
      setFiltersOpen(false);
      return;
    }

    setFiltersOpen(true);
  };

  const toggleSpeed = (speed: ExplorerSpeed): void => {
    setExplorerSettings((current) => {
      const currentSpeeds = current.selectedSpeeds;
      if (currentSpeeds.includes(speed)) {
        return {
          ...current,
          selectedSpeeds:
            currentSpeeds.length > 1
              ? currentSpeeds.filter((currentSpeed) => currentSpeed !== speed)
              : currentSpeeds,
        };
      }

      return { ...current, selectedSpeeds: [...currentSpeeds, speed] };
    });
  };

  const explorerUrl = useMemo(() => {
    if (explorerScope === "player" && !username.trim()) return null;
    const speeds = SPEED_FILTERS.filter(({ key }) => selectedSpeeds.includes(key)).map(
      ({ value }) => value,
    );
    return buildOpeningExplorerUrl({
      fen: currentFen,
      speeds,
      startDate: activeStartDate,
      endDate,
      ...(explorerScope === "player"
        ? { username, opponent, color: playerColor, minRating: playerRatingValue }
        : {}),
    });
  }, [
    activeStartDate,
    currentFen,
    endDate,
    explorerScope,
    opponent,
    playerColor,
    playerRatingValue,
    selectedSpeeds,
    username,
  ]);
  const requestExplorer = useCallback(
    (signal: AbortSignal, navigation: ExplorerRequestNavigation) =>
      explorerUrl
        ? fetchExplorerApiResponse(explorerUrl, "visible", signal, navigation).then((response) => ({
            response,
          }))
        : null,
    [explorerUrl],
  );
  const {
    moves: explorerMoves,
    recentGames,
    status: explorerStatus,
    error: explorerError,
  } = useOpeningExplorer({
    enabled: explorerOpen || !atomicDbEngineSettings.enabled,
    cacheKey: explorerUrl ?? undefined,
    // The backend cancels superseded navigation requests, so a short trailing
    // debounce is enough to collapse move-list scrubbing without making each
    // deliberate move feel a quarter-second slower.
    debounceMs: 100,
    fen: currentFen,
    playerColor,
    showPerformance: explorerScope === "player",
    request: requestExplorer,
    timeoutMessage: "Opening explorer took too long to respond. Try fewer filters or refresh.",
  });
  useEffect(() => {
    setHoveredExplorerMoveUci(null);
  }, [currentFen, explorerOpen, explorerStatus, filtersOpen]);

  useEffect(() => {
    if (!positionAnalysisEnabled || threatFen === null) setThreatMode(false);
  }, [positionAnalysisEnabled, threatFen]);

  useEffect(() => {
    const handleAnalysisShortcut = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const shortcutIndex = shortcutIndexFromKeyboardEvent(event);
      const isSpacebarShortcut = key === " " || key === "spacebar";
      const isExplorerMoveShortcut = shortcutIndex !== null && !isSpacebarShortcut;

      if (
        (key !== "e" &&
          key !== "f" &&
          key !== "k" &&
          key !== "x" &&
          key !== "z" &&
          !isSpacebarShortcut &&
          !isExplorerMoveShortcut) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (isTextEntryTarget(event.target)) return;

      if (isSpacebarShortcut) {
        // Space is reserved for move playback on this page, even while no move is available.
        event.preventDefault();
        if (usernamePickerOpen || filtersOpen) return;

        const move = selectSpacebarMove({
          engineEnabled: positionAnalysisEnabled,
          engineResult: atomicDbAnalysis.result,
          engineStatus: atomicDbAnalysis.status,
          databaseMoves: explorerMoves,
          databaseStatus: explorerStatus,
          fen: currentFen,
        });
        if (!move) return;

        playExplorerMove(move);
        return;
      }

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
      } else if (key === "z" && game) {
        event.preventDefault();
        setGameComputerAnalysisEnabled((enabled) => !enabled);
      } else if (key === "k") {
        setAtomicDbEngineSettings((current) => ({
          ...current,
          showFollowUpMoves: !current.showFollowUpMoves,
        }));
      } else if (key === "x") {
        if (positionAnalysisEnabled && threatFen !== null) {
          setThreatMode((enabled) => !enabled);
        }
      } else {
        flipBoard();
      }
    };

    window.addEventListener("keydown", handleAnalysisShortcut, { capture: true });
    return () => window.removeEventListener("keydown", handleAnalysisShortcut, { capture: true });
  }, [
    atomicDbAnalysis.result,
    atomicDbAnalysis.status,
    atomicDbEngineSettings.enabled,
    currentFen,
    explorerMoves,
    explorerOpen,
    explorerStatus,
    filtersOpen,
    flipBoard,
    game,
    positionAnalysisEnabled,
    setAtomicDbEngineSettings,
    setExplorerOpen,
    threatFen,
    usernamePickerOpen,
  ]);

  const openingExplorerPanel = explorerOpen ? (
    <OpeningExplorerPanel
      className="analysisExplorerPanel"
      ariaLabel="Opening explorer"
      tableClassName="analysisExplorerTableWrap"
      displayProps={
        showExplorerResults
          ? {
              moves: explorerMoves,
              recentGames,
              status: explorerStatus,
              error: explorerError,
              emptyMessage:
                explorerScope === "player" && !username.trim()
                  ? "Enter a username for player explorer."
                  : "No database games for this position.",
              showPerformance: explorerScope === "player",
              orientation,
              currentPly,
              onPlayMove: playExplorerMove,
              onHoverMove: setHoveredExplorerMoveUci,
            }
          : undefined
      }
    >
      {moveGameExplorerLeft ? null : (
        <OpeningExplorerResizeHandle
          valueNow={explorerSplitValue}
          onPointerDown={handleExplorerResizePointerDown}
          onKeyDown={handleExplorerResizeKeyDown}
        />
      )}
      <div className="analysisExplorerCompactHeader">
        <div className="analysisExplorerTabs" role="tablist" aria-label="Opening explorer source">
          <button
            type="button"
            role="tab"
            className={explorerScope === "general" ? "active" : ""}
            aria-selected={explorerScope === "general"}
            onClick={() => {
              updateExplorerSettings({ explorerScope: "general" });
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
          aria-label={filtersOpen ? "Close opening explorer settings" : "Opening explorer settings"}
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
                      onClick={() => updateExplorerSettings({ opponent: "" })}
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
                onChange={(event) =>
                  updateExplorerSettings({ minRating: Number(event.target.value) })
                }
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
                    updateExplorerSettings({ playerStartDate: nextStartDate });
                  } else {
                    updateExplorerSettings({ generalStartDate: nextStartDate });
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
                onChange={(event) => updateExplorerSettings({ endDate: event.target.value })}
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
    </OpeningExplorerPanel>
  ) : null;

  return (
    <AnalysisWorkspaceLayout
      className={game ? "gameAnalysisPage" : undefined}
      style={analysisPageStyle}
    >
      <Seo
        title={game ? `${game.player_1} vs ${game.player_2}` : "Analysis board"}
        description={
          game
            ? `Analyze the atomic chess game between ${game.player_1} and ${game.player_2}.`
            : "Analyze atomic chess positions and browse opening explorer filters."
        }
        path={game ? `/game/${game.game_id}` : "/analysis"}
      />

      <div className={game ? "gameAnalysisRightRail" : "analysisRightRail"}>
        <AnalysisWorkspacePanel
          ref={rightPanelRef}
          className={`analysisRightPanel ${game ? "gameAnalysisPanel" : ""} ${explorerInAnalysisPanel ? "explorerOpen" : "explorerCollapsed"} ${
            explorerInAnalysisPanel && movePanelHeight === MIN_MOVE_PANEL_HEIGHT
              ? "movesCollapsed"
              : ""
          } ${explorerInAnalysisPanel && movePanelHeight !== null ? "customExplorerSplit" : ""} ${
            explorerResizing ? "explorerResizing" : ""
          } ${gamePanelResizing ? "gamePanelResizing" : ""} ${
            game && !gameComputerAnalysisEnabled ? "computerAnalysisDisabled" : ""
          }`}
          style={rightPanelStyle}
          aria-label="Analysis controls"
        >
          <div className="analysisMovePanel" ref={movePanelRef}>
            {!game || gameComputerAnalysisEnabled ? (
              <AtomicDbAnalysisBlock
                fen={displayedAnalysisFen}
                analysis={displayedAnalysis}
                settings={atomicDbEngineSettings}
                setSettings={setAtomicDbEngineSettings}
                onDisable={() => {
                  setHoveredExplorerMoveUci(null);
                  setThreatMode(false);
                }}
                onFlipBoard={flipBoard}
                onThreatModeChange={setThreatMode}
                threatAvailable={threatFen !== null}
                threatMode={effectiveThreatMode}
                notationInline={notationLayout === "inline"}
                onToggleNotation={() =>
                  setNotationLayout((current) => (current === "inline" ? "non-inline" : "inline"))
                }
                onPlayLine={playAtomicDbLine}
                onHoverMove={setHoveredExplorerMoveUci}
                disabled={atomicDbLinePlaying || effectiveThreatMode}
              />
            ) : null}
            <div className="analysisMoveContent" ref={moveContentRef}>
              <MoveNotation
                lines={analysisLines}
                moves={moveList}
                currentPly={currentPly}
                pinnedLineIndex={activeLineIndex}
                inline={notationLayout === "inline"}
                onNavigate={navigateToPly}
                onSelectVariation={navigateToAnalysisMove}
                onCycleOptions={requestNavigation}
                onAnnotate={game ? undefined : annotateMove}
                onDelete={game ? undefined : deleteMove}
                assessments={game && gameComputerAnalysisEnabled ? gameAssessments : undefined}
              />
            </div>
          </div>

          {moveGameExplorerLeft ? null : openingExplorerPanel}

          <AnalysisToolbar
            active={explorerOpen}
            ariaLabel="Analysis menu"
            canStepBack={canStepBack}
            canStepForward={canStepForward}
            onNavigate={requestNavigation}
            onToggle={() => setExplorerOpen((open) => !open)}
            toggleAriaLabel={explorerOpen ? "Hide opening explorer" : "Show opening explorer"}
            toggleClassName="explorer"
            toggleTitle="Opening explorer"
          />
          {game ? (
            <button
              type="button"
              className="gameAnalysisPanelResizeHandle"
              aria-label="Resize analysis panel height"
              title="Resize analysis panel height"
              onPointerDown={handleGamePanelResizePointerDown}
              onKeyDown={handleGamePanelResizeKeyDown}
            />
          ) : null}
        </AnalysisWorkspacePanel>

        {game && gameComputerAnalysisEnabled && gameUnderboardTab === "analysis" ? (
          <div className="gameComputerSummaryDock">
            <GameComputerAnalysisPlayers game={game} analysis={gameAnalysis.analysis} />
          </div>
        ) : null}
      </div>

      {game ? (
        <div className="gameAnalysisSidebarRail">
          <aside
            className={`gameAnalysisSidebar ${moveGameExplorerLeft ? "withExplorer" : ""}`}
            aria-label="Game details"
          >
            <GameAnalysisHeader game={game} />
            {moveGameExplorerLeft ? openingExplorerPanel : null}
          </aside>
          <GameMatchNavigation game={game} />
        </div>
      ) : null}

      {usernamePickerOpen ? (
        <UsernamePickerModal
          id="analysis-username-picker-title"
          title={usernamePickerTarget === "opponent" ? "Choose opponent" : "Choose player"}
          recentUsernames={recentUsernames}
          presetUsernames={gamePlayerPresets}
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

      <BoardWorkspace
        boardPanelRef={boardPanelRef}
        boardAriaLabel="Atomic chess board"
        boardTabIndex={0}
        chessboardProps={{
          puzzleId: "analysis",
          fen: rootFen,
          orientation,
          coordinates: true,
          solution: "",
          showSolution: false,
          analysisMode: true,
          captureNavigationShortcuts: true,
          solutionNavigation: navigation,
          previewMove: threatMoveUci ?? hoveredExplorerMoveUci,
          previewMoveBrush: threatMoveUci ? "red" : "paleBlue",
          analysisMarker:
            gameComputerAnalysisEnabled &&
            boardState?.customLineIndex === undefined &&
            currentVisibleAssessment
              ? {
                  uci: currentVisibleAssessment.uci,
                  symbol: currentVisibleAssessment.symbol,
                  fill:
                    currentVisibleAssessment.classification === "blunder"
                      ? "var(--analysis-blunder)"
                      : currentVisibleAssessment.classification === "mistake"
                        ? "var(--analysis-mistake)"
                        : "var(--analysis-inaccuracy)",
                }
              : null,
          onNavigateHandled: handleNavigationHandled,
          onStateChange: setBoardState,
        }}
        boardBefore={
          game ? (
            <GameBoardClock
              game={game}
              currentPly={currentPly}
              color={orientation === "white" ? "black" : "white"}
            />
          ) : null
        }
        boardAfter={
          game ? (
            <GameBoardClock
              game={game}
              currentPly={currentPly}
              color={orientation === "white" ? "white" : "black"}
            />
          ) : null
        }
        boardOverlay={
          <>
            <AtomicDbEvalBar
              fen={displayedAnalysisFen}
              analysis={displayedAnalysis}
              enabled={positionAnalysisEnabled}
              orientation={orientation}
              threatMode={effectiveThreatMode}
            />
            <button
              type="button"
              className="analysisBoardResizeHandle"
              aria-label="Resize analysis board"
              title="Resize board"
              onPointerDown={handleBoardResizePointerDown}
            />
          </>
        }
        lichessHref={currentLichessAnalysisUrl}
        showActions={!game}
        atomicDbHref={atomicDbHref}
        {...(!game && atomicDbRequest ? { atomicDbRequest } : {})}
        document={boardDocument}
        showDocument={!game}
      />
      {game ? (
        <GameUnderboard
          game={game}
          currentPly={currentPly}
          moves={moveList}
          document={boardDocument}
          onNavigatePly={navigateToPly}
          atomicDbHref={atomicDbHref}
          computerAnalysis={
            <GameComputerAnalysis
              analysis={gameAnalysis.analysis}
              isLoading={gameAnalysis.isLoading}
              isRequesting={gameAnalysis.isRequesting}
              requestError={gameAnalysis.requestError ?? gameAnalysis.loadError}
              authenticated={auth.isAuthenticated}
              onRequest={gameAnalysis.request}
              onLogin={() => void auth.login(`/game/${encodeURIComponent(game.game_id)}`)}
              moves={moveList}
              currentPly={currentPly}
              onNavigate={navigateToPly}
            />
          }
          computerAnalysisEnabled={gameComputerAnalysisEnabled}
          onActiveTabChange={setGameUnderboardTab}
          {...(atomicDbRequest ? { atomicDbRequest } : {})}
        />
      ) : null}
    </AnalysisWorkspaceLayout>
  );
};
