import "./TournamentPage.css";

import { faCheck, faComment, faRobot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  UIEvent as ReactUIEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import {
  tournamentBracketQueryOptions,
  tournamentCatalogQueryOptions,
} from "../../lib/matches/tournamentQueries";
import {
  getAdjacentTournamentMetas,
  getTournamentDecisiveMatch,
  getTournamentRouteId,
  type TournamentBracket,
  type TournamentBracketStage,
  type TournamentMatch,
} from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatCalendarDateRange } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { AtomicChessLeaguePage } from "./AtomicChessLeaguePage";
import {
  BOARD_PADDING,
  buildStageTreeLayout,
  buildStartRoundState,
  buildZoomState,
  CARD_WIDTH,
  clampZoom,
  COLUMN_GAP,
  DEFAULT_STAGE_ZOOM,
  getRoundShortLabel,
  getStageStartRound,
  getStageTrophyMatchId,
  getStartRoundOptions,
  getTournamentViewStorageKey,
  HEADER_SPACE,
  type PositionedMatch,
  readSavedTournamentView,
  SEEDS_STAGE_KEY,
  STAGE_ZOOM_STEP,
  type StageLayout,
  zoomDisplayPercent,
} from "./bracketLayout";
import { WolfarenaTournamentPage } from "./WolfarenaTournamentPage";

type StageKey = string;

type DragState = {
  stageKey: string;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
};

type TournamentSeedEntry = {
  playerName: string;
  seed: number;
};

const tournamentHeading = (bracket: TournamentBracket): string => {
  if (bracket.headingTitle) return bracket.headingTitle;
  return `${bracket.seriesName} ${bracket.year}`;
};
const winnerName = (match: TournamentMatch): string => {
  if (match.s1 > match.s2) return match.p1;
  if (match.s2 > match.s1) return match.p2;
  return "Draw";
};

const isEmptyPlayer = (playerName: string): boolean => String(playerName || "").trim() === "";

const isByePlayer = (playerName: string): boolean =>
  String(playerName || "")
    .trim()
    .toLowerCase() === "bye";

const isByeMatch = (match: TournamentMatch | null | undefined): boolean =>
  isByePlayer(match?.p1 ?? "") || isByePlayer(match?.p2 ?? "");

const isEmptyMatch = (match: TournamentMatch | null | undefined): boolean =>
  isEmptyPlayer(match?.p1 ?? "") && isEmptyPlayer(match?.p2 ?? "");

const isWithdrawalScore = (leftScore: number, rightScore: number): boolean =>
  (leftScore === 1 && rightScore === 0) || (leftScore === 0 && rightScore === 1);

const scoreDisplay = (score: number | string): string => String(score);
const withdrewPlayerName = (match: TournamentMatch): string => {
  if (isByeMatch(match) || !isWithdrawalScore(match.s1, match.s2)) return "";
  return match.s1 < match.s2 ? match.p1 : match.p2;
};
const scoreSlotDisplay = (match: TournamentMatch, playerName: string): string => {
  if (isEmptyPlayer(playerName)) {
    return "";
  }

  if (isEmptyMatch(match)) {
    return "";
  }

  if (!match.match_id && (isEmptyPlayer(match.p1) || isEmptyPlayer(match.p2))) {
    return "";
  }

  if (!match.match_id && match.s1 === 0 && match.s2 === 0) {
    return "";
  }

  if (isByeMatch(match)) {
    return "";
  }

  if (!isWithdrawalScore(match.s1, match.s2)) {
    return playerName === match.p1 ? scoreDisplay(match.s1) : scoreDisplay(match.s2);
  }

  return withdrewPlayerName(match) === playerName ? "w/o" : "—";
};
const PLAYER_NAME_TRUNCATION_LIMIT = 13;
const isExternalMatchUrl = (value: string): boolean =>
  /^https?:\/\//i.test(String(value || "").trim());

const getBracketDisplayName = (playerName: string): string => {
  const name = String(playerName || "");
  if (name.length <= PLAYER_NAME_TRUNCATION_LIMIT) return name;

  const prefix = name.slice(0, PLAYER_NAME_TRUNCATION_LIMIT + 1);
  const lastDelimiterIndex = Math.max(prefix.lastIndexOf("_"), prefix.lastIndexOf("-"));

  return lastDelimiterIndex > 0 ? name.slice(0, lastDelimiterIndex) : name;
};

const SeedBadge = ({ seed, seedCount }: { seed?: number | null | undefined; seedCount: number }) =>
  seedCount ? (
    <span
      className={`tournamentSeedBadge${seedCount <= 8 ? " isSingleDigit" : ""}`}
      aria-label={seed ? `Seed ${seed}` : undefined}
      aria-hidden={seed ? undefined : true}
    >
      {seed || null}
    </span>
  ) : null;

const FAIR_PLAY_FLAGGED_PLAYERS = new Set(["neverofzero", "taisthuban", "jasos12"]);
const FAIR_PLAY_FLAG_LABEL =
  "Fair-play flag: this player cheated in this tournament, so interpret their results accordingly.";

const isFairPlayFlaggedPlayer = (playerName: string): boolean =>
  FAIR_PLAY_FLAGGED_PLAYERS.has(normalizeUsername(playerName));

const FairPlayFlagBadge = ({ playerName }: { playerName: string }) =>
  isFairPlayFlaggedPlayer(playerName) ? (
    <span
      className="tournamentFairPlayFlag"
      title={FAIR_PLAY_FLAG_LABEL}
      aria-label={FAIR_PLAY_FLAG_LABEL}
    >
      <FontAwesomeIcon icon={faRobot} />
    </span>
  ) : null;

const AdvanceCheck = () => (
  <span className="tournamentAdvanceCheck" aria-label="Advanced">
    <FontAwesomeIcon icon={faCheck} />
  </span>
);

const countryCodeToFlag = (countryCode: string | null | undefined): string =>
  String(countryCode || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);

const neutralFlagDataUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='12' viewBox='0 0 20 12'%3E%3Crect width='20' height='12' rx='2' fill='%230f1f3b'/%3E%3Ccircle cx='10' cy='6' r='4' fill='none' stroke='%23d7e3ff' stroke-width='1'/%3E%3Cpath d='M6 6h8M10 2v8M7.2 3.3c.8.5 1.8.7 2.8.7s2-.2 2.8-.7M7.2 8.7c.8-.5 1.8-.7 2.8-.7s2 .2 2.8.7' fill='none' stroke='%23d7e3ff' stroke-width='.7' stroke-linecap='round'/%3E%3C/svg%3E";

const countryCodeToFlagUrl = (countryCode: string | null | undefined): string => {
  const normalized = countryCodeToFlag(countryCode);
  return normalized ? `https://flagcdn.com/${normalized.toLowerCase()}.svg` : neutralFlagDataUrl;
};

const isInteractivePointerTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest(".tournamentMatchCardTree")) return false;

  return Boolean(
    target.closest("a, button, input, select, textarea, [role='button'], [role='link']"),
  );
};

const PlayerLabel = ({
  playerName,
  seed,
  seedCount,
  isWinner,
  countryCode,
  shouldSuppressClick,
}: {
  playerName: string;
  seed?: number | null | undefined;
  seedCount: number;
  isWinner: boolean;
  countryCode?: string | null | undefined;
  shouldSuppressClick: () => boolean;
}) => (
  <span className="tournamentPlayerLabel">
    <SeedBadge seed={seed} seedCount={seedCount} />
    {!isByePlayer(playerName) && !isEmptyPlayer(playerName) ? (
      <img
        className="tournamentPlayerFlag"
        crossOrigin="anonymous"
        src={countryCodeToFlagUrl(countryCode)}
        alt=""
        loading="lazy"
        decoding="async"
        aria-hidden="true"
      />
    ) : null}
    {isEmptyPlayer(playerName) ? (
      <span className="tournamentPlayerEmpty" aria-hidden="true">
        &nbsp;
      </span>
    ) : isByePlayer(playerName) ? (
      <span className="tournamentPlayerBye">bye</span>
    ) : (
      <Link
        className="tournamentPlayerLink"
        to="/@/$username"
        params={{ username: normalizeUsername(playerName) }}
        onClick={(event) => {
          if (shouldSuppressClick()) {
            event.preventDefault();
          }
          event.stopPropagation();
        }}
        title={playerName}
      >
        {getBracketDisplayName(playerName)}
      </Link>
    )}
    <FairPlayFlagBadge playerName={playerName} />
    {isWinner ? <AdvanceCheck /> : null}
  </span>
);

const TournamentStateMessage = ({ title, message }: { title: string; message: string }) => (
  <div className="tournamentPage tournamentPageMissing">
    <h1>{title}</h1>
    <p>{message}</p>
    <Link className="tournamentBackLink" to="/tournaments">
      Back to tournaments
    </Link>
  </div>
);

const TournamentSeeds = ({
  seeds,
  countryMap,
}: {
  seeds: TournamentSeedEntry[];
  countryMap: Map<string, string>;
}) => (
  <section className="tournamentSeedsSection" aria-labelledby="tournament-seeds-heading">
    <h2 id="tournament-seeds-heading">Seeds</h2>
    <ol className="tournamentSeedsList">
      {seeds.map(({ playerName, seed }) => (
        <li key={`${seed}-${playerName}`} value={seed}>
          <span className="tournamentSeedsNumber" aria-label={`Seed ${seed}`}>
            {seed}
          </span>
          <img
            className="tournamentPlayerFlag"
            crossOrigin="anonymous"
            src={countryCodeToFlagUrl(
              countryMap.get(normalizeUsername(playerName)) ?? countryMap.get(playerName),
            )}
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <Link
            className="tournamentSeedsPlayerLink"
            to="/@/$username"
            params={{ username: normalizeUsername(playerName) }}
          >
            {playerName}
          </Link>
          <FairPlayFlagBadge playerName={playerName} />
        </li>
      ))}
    </ol>
  </section>
);

const TournamentMatchCard = ({
  match,
  topSeedMap,
  seedCount,
  countryMap,
  trophyAssetPath,
  showTrophy,
  placeTrophyOnSide,
  shouldSuppressClick,
  onOpenMatch,
}: {
  match: PositionedMatch;
  topSeedMap: Map<string, number>;
  seedCount: number;
  countryMap: Map<string, string>;
  trophyAssetPath: string | undefined;
  showTrophy: boolean;
  placeTrophyOnSide: boolean;
  shouldSuppressClick: () => boolean;
  onOpenMatch: (match: TournamentMatch) => void;
}) => {
  const matchWinner = winnerName(match);
  const withdrawalPlayer = withdrewPlayerName(match);
  const hasMatchPage = Boolean(match.match_id);
  const shouldShowTrophy = showTrophy && Boolean(trophyAssetPath);

  return (
    <div
      className={`tournamentMatchCard tournamentMatchCardTree${hasMatchPage ? " isClickable" : ""}${shouldShowTrophy ? " hasTrophy" : ""}${shouldShowTrophy && placeTrophyOnSide ? " hasSideTrophy" : ""}`}
      style={{
        left: `${match.x}px`,
        top: `${match.y}px`,
        width: `${CARD_WIDTH}px`,
      }}
      onClick={
        hasMatchPage
          ? (event) => {
              if (shouldSuppressClick()) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              onOpenMatch(match);
            }
          : undefined
      }
      role={hasMatchPage ? "link" : undefined}
      tabIndex={hasMatchPage ? 0 : undefined}
      onKeyDown={
        hasMatchPage
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpenMatch(match);
            }
          : undefined
      }
    >
      {shouldShowTrophy ? (
        <img
          className="tournamentMatchTrophy"
          src={appAssetPath(trophyAssetPath || "")}
          alt=""
          width="96"
          height="96"
          loading="eager"
          decoding="async"
          aria-hidden="true"
        />
      ) : null}
      <div className="tournamentMatchPlayers">
        <div className={`tournamentPlayerRow${matchWinner === match.p1 ? " isWinner" : ""}`}>
          <span>
            <PlayerLabel
              playerName={match.p1}
              seed={topSeedMap.get(match.p1)}
              seedCount={seedCount}
              isWinner={matchWinner === match.p1}
              countryCode={countryMap.get(match.p1)}
              shouldSuppressClick={shouldSuppressClick}
            />
          </span>
          <strong className={withdrawalPlayer === match.p1 ? "tournamentScoreWithdrawal" : ""}>
            {scoreSlotDisplay(match, match.p1)}
          </strong>
        </div>
        <div className={`tournamentPlayerRow${matchWinner === match.p2 ? " isWinner" : ""}`}>
          <span>
            <PlayerLabel
              playerName={match.p2}
              seed={topSeedMap.get(match.p2)}
              seedCount={seedCount}
              isWinner={matchWinner === match.p2}
              countryCode={countryMap.get(match.p2)}
              shouldSuppressClick={shouldSuppressClick}
            />
          </span>
          <strong className={withdrawalPlayer === match.p2 ? "tournamentScoreWithdrawal" : ""}>
            {scoreSlotDisplay(match, match.p2)}
          </strong>
        </div>
      </div>
    </div>
  );
};

const TournamentZoomControls = ({
  stageLabel,
  zoomLevel,
  onZoomOut,
  onZoomReset,
  onZoomIn,
}: {
  stageLabel: string;
  zoomLevel: number;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
}) => (
  <div
    className="tournamentZoomControls"
    role="group"
    aria-label={`Zoom controls for ${stageLabel}`}
  >
    <button
      type="button"
      className="tournamentZoomButton"
      onClick={onZoomOut}
      aria-label={`Zoom out ${stageLabel}`}
    >
      -
    </button>
    <button
      type="button"
      className="tournamentZoomValue"
      onClick={onZoomReset}
      aria-label={`Reset zoom for ${stageLabel}`}
    >
      {zoomDisplayPercent(zoomLevel)}%
    </button>
    <button
      type="button"
      className="tournamentZoomButton"
      onClick={onZoomIn}
      aria-label={`Zoom in ${stageLabel}`}
    >
      +
    </button>
  </div>
);

const TournamentStageSection = ({
  stage,
  layout,
  zoomLevel,
  isDragging,
  startRoundName,
  topSeedMap,
  seedCount,
  countryMap,
  trophyAssetPath,
  decisiveMatchId,
  hideStartRoundControls,
  shouldSuppressMatchClick,
  onOpenMatch,
  onStartRoundChange,
  setHeaderTrackRef,
  setScrollerRef,
  onScrollerScroll,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: {
  stage: TournamentBracketStage;
  layout: StageLayout;
  zoomLevel: number;
  isDragging: boolean;
  startRoundName: string;
  topSeedMap: Map<string, number>;
  seedCount: number;
  countryMap: Map<string, string>;
  trophyAssetPath: string | undefined;
  decisiveMatchId: string;
  hideStartRoundControls?: boolean;
  shouldSuppressMatchClick: () => boolean;
  onOpenMatch: (match: TournamentMatch) => void;
  onStartRoundChange: (roundName: string) => void;
  setHeaderTrackRef: (stageKey: StageKey, node: HTMLDivElement | null) => void;
  setScrollerRef: (stageKey: StageKey, node: HTMLDivElement | null) => void;
  onScrollerScroll: (stageKey: StageKey, event: ReactUIEvent<HTMLDivElement>) => void;
  onPointerDown: (stageKey: StageKey, event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) => {
  const startRoundOptions = getStartRoundOptions(stage);
  const trophyMatchId = trophyAssetPath ? getStageTrophyMatchId(stage, decisiveMatchId) : "";

  return (
    <section className="tournamentStageSection" aria-labelledby={`${stage.key}-heading`}>
      <div className="tournamentStageHeader">
        <h2 id={`${stage.key}-heading`}>{stage.label}</h2>
      </div>
      {!hideStartRoundControls && startRoundOptions.length > 1 ? (
        <div className="tournamentRoundNavigator" aria-label={`Starting round for ${stage.label}`}>
          <div className="tournamentRoundTabs" role="tablist" aria-label={`${stage.label} rounds`}>
            {startRoundOptions.map((round) => {
              const isSelected = round.roundName === startRoundName;

              return (
                <button
                  key={round.roundName}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`tournamentRoundTab${isSelected ? " isActive" : ""}`}
                  onClick={() => onStartRoundChange(round.roundName)}
                  title={`Start bracket at ${round.roundName}`}
                >
                  {getRoundShortLabel(round.roundName)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {layout ? (
        <div
          className="tournamentRoundHeaderRail"
          style={{
            height: `${HEADER_SPACE * zoomLevel}px`,
            marginBottom: `${-HEADER_SPACE * zoomLevel}px`,
          }}
        >
          <div
            className="tournamentRoundHeaderTrack"
            ref={(node) => setHeaderTrackRef(stage.key, node)}
            style={{
              width: `${layout.width * zoomLevel}px`,
            }}
          >
            {layout.rounds.map((round, roundIndex) => (
              <div
                key={`${stage.key}-${round.roundName}-sticky`}
                className="tournamentRoundHeader tournamentRoundHeaderSticky"
                style={{
                  left: `${(BOARD_PADDING + roundIndex * (CARD_WIDTH + COLUMN_GAP)) * zoomLevel}px`,
                  width: `${CARD_WIDTH * zoomLevel}px`,
                }}
              >
                <span>{round.roundName}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div
        className="tournamentDrawViewport"
        aria-label={`${stage.label} draw starting at ${startRoundName}`}
      >
        <div
          className={`tournamentRoundsScroller${isDragging ? " isDragging" : ""}${stage.key === "main" ? " isMainBracket" : ""}`}
          ref={(node) => setScrollerRef(stage.key, node)}
          onPointerDown={(event) => onPointerDown(stage.key, event)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onScroll={(event) => onScrollerScroll(stage.key, event)}
        >
          {!layout ? null : (
            <div
              className="tournamentTreeBoardViewport"
              style={{
                width: `${layout.width * zoomLevel}px`,
                height: `${layout.height * zoomLevel}px`,
              }}
            >
              <div
                className={`tournamentTreeBoard${stage.key === "main" ? " isMainTree" : ""}`}
                style={{
                  width: `${layout.width}px`,
                  height: `${layout.height}px`,
                  transform: `scale(${zoomLevel})`,
                }}
              >
                <svg
                  className="tournamentTreeLines"
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {layout.connectors.map((connector) => (
                    <line
                      key={connector.key}
                      x1={connector.x1}
                      y1={connector.y1}
                      x2={connector.x2}
                      y2={connector.y2}
                    />
                  ))}
                </svg>

                {layout.positionedMatches.map((match) => (
                  <TournamentMatchCard
                    key={match.id}
                    match={match}
                    topSeedMap={topSeedMap}
                    seedCount={seedCount}
                    countryMap={countryMap}
                    trophyAssetPath={trophyAssetPath}
                    showTrophy={match.id === trophyMatchId}
                    placeTrophyOnSide={
                      startRoundName === "Semifinals" || startRoundName === "Finals"
                    }
                    shouldSuppressClick={shouldSuppressMatchClick}
                    onOpenMatch={onOpenMatch}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const BracketTournamentPage = ({ tournamentId }: { tournamentId: string }) => {
  const navigate = useNavigate();
  const catalogQuery = useQuery(tournamentCatalogQueryOptions());
  const adjacentTournaments = useMemo(
    () => getAdjacentTournamentMetas(tournamentId, catalogQuery.data ?? []),
    [catalogQuery.data, tournamentId],
  );
  const bracketQuery = useQuery({
    ...tournamentBracketQueryOptions(tournamentId),
    enabled: Boolean(tournamentId),
  });
  const bracket: TournamentBracket | null = bracketQuery.data ?? null;
  const bracketLoading = bracketQuery.isPending;
  const bracketError = bracketQuery.error
    ? bracketQuery.error instanceof Error
      ? bracketQuery.error.message
      : "Unable to load tournament"
    : "";
  const [startRounds, setStartRounds] = useState<Record<string, string>>({});
  const [zoomLevels, setZoomLevels] = useState<Record<string, number>>({});
  const [activeStageKey, setActiveStageKey] = useState<string>("main");
  const [draggingStage, setDraggingStage] = useState<string>("");
  const dragStateRef = useRef<DragState | null>(null);
  const suppressNextMatchClickRef = useRef(false);
  const scrollerRefs = useRef<Record<string, HTMLDivElement>>({});
  const headerTrackRefs = useRef<Record<string, HTMLDivElement>>({});
  const pendingRestoreRef = useRef<{
    scrollPositions: Record<string, { left?: number; top?: number }>;
    pageScrollY: number;
  } | null>(null);

  const saveViewState = useCallback(() => {
    if (!bracket || typeof window === "undefined") return;

    const scrollPositions = Object.fromEntries(
      bracket.stages.map((stage) => {
        const scroller = scrollerRefs.current[stage.key];
        return [
          stage.key,
          {
            left: scroller?.scrollLeft || 0,
            top: scroller?.scrollTop || 0,
          },
        ];
      }),
    );

    window.sessionStorage.setItem(
      getTournamentViewStorageKey(bracket.id),
      JSON.stringify({
        startRounds,
        zoomLevels,
        activeStageKey,
        scrollPositions,
        pageScrollY: window.scrollY || 0,
      }),
    );
  }, [activeStageKey, bracket, startRounds, zoomLevels]);

  useEffect(() => {
    if (!bracket) return;

    const defaultStartRounds = buildStartRoundState(
      bracket.stages || [],
      bracket.defaultMainBracketStartRound,
    );
    const savedView = readSavedTournamentView(bracket.id);
    const availableStageKeys = new Set((bracket.stages || []).map((stage) => stage.key));
    if (Object.keys(bracket.seedMap || {}).length) {
      availableStageKeys.add(SEEDS_STAGE_KEY);
    }
    const defaultActiveStageKey = availableStageKeys.has("main")
      ? "main"
      : bracket.stages[0]?.key || "";
    const savedActiveStageKey = String(savedView?.activeStageKey || "").trim();

    setStartRounds({ ...defaultStartRounds, ...(savedView?.startRounds || {}) });
    setZoomLevels(buildZoomState(bracket.stages || [], savedView?.zoomLevels || {}));
    setActiveStageKey(
      savedActiveStageKey && availableStageKeys.has(savedActiveStageKey)
        ? savedActiveStageKey
        : defaultActiveStageKey,
    );
    pendingRestoreRef.current = savedView
      ? {
          scrollPositions: savedView.scrollPositions || {},
          pageScrollY: Number(savedView.pageScrollY) || 0,
        }
      : null;
  }, [bracket]);

  useEffect(() => {
    if (!bracket || !pendingRestoreRef.current || typeof window === "undefined") return;

    const pendingRestore = pendingRestoreRef.current;
    const frameId = window.requestAnimationFrame(() => {
      Object.entries(pendingRestore.scrollPositions || {}).forEach(([stageKey, scrollPosition]) => {
        const scroller = scrollerRefs.current[stageKey];
        if (!scroller) return;
        scroller.scrollLeft = Number(scrollPosition?.left) || 0;
        scroller.scrollTop = Number(scrollPosition?.top) || 0;
        syncRoundHeaderTrack(stageKey, scroller.scrollLeft);
      });

      window.scrollTo({
        top: pendingRestore.pageScrollY || 0,
        left: 0,
        behavior: "auto",
      });

      pendingRestoreRef.current = null;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [bracket, startRounds, zoomLevels]);

  useEffect(() => {
    if (!bracket || typeof window === "undefined") return undefined;

    return () => {
      saveViewState();
    };
  }, [bracket, saveViewState]);

  const stageLayouts = useMemo(() => {
    if (!bracket) return new Map();

    return new Map(
      bracket.stages.map((stage) => [
        stage.key,
        buildStageTreeLayout(stage, getStageStartRound(stage, startRounds)),
      ]),
    );
  }, [bracket, startRounds]);

  const topSeedMap = useMemo(() => new Map(Object.entries(bracket?.seedMap || {})), [bracket]);
  const countryMap = useMemo(() => new Map(Object.entries(bracket?.countryMap || {})), [bracket]);
  const seedEntries = useMemo<TournamentSeedEntry[]>(() => {
    if (!bracket) return [];

    const displayNamesByUsername = new Map<string, string>();
    bracket.matches.forEach((match) => {
      [match.p1, match.p2].forEach((playerName) => {
        if (isEmptyPlayer(playerName) || isByePlayer(playerName)) return;
        const username = normalizeUsername(playerName);
        if (username && !displayNamesByUsername.has(username)) {
          displayNamesByUsername.set(username, playerName);
        }
      });
    });

    return Object.entries(bracket.seedMap || {})
      .map(([playerName, seed]) => ({
        playerName: displayNamesByUsername.get(normalizeUsername(playerName)) || playerName,
        seed,
      }))
      .sort(
        (left, right) => left.seed - right.seed || left.playerName.localeCompare(right.playerName),
      );
  }, [bracket]);
  const decisiveMatchId = useMemo(() => getTournamentDecisiveMatch(bracket)?.id || "", [bracket]);
  const visibleStages = useMemo(
    () => bracket?.stages?.filter((stage) => stage.key === activeStageKey) || [],
    [bracket, activeStageKey],
  );
  const activeStage = visibleStages[0];

  const setScrollerRef = (stageKey: string, node: HTMLDivElement | null): void => {
    if (node) {
      scrollerRefs.current[stageKey] = node;
      syncRoundHeaderTrack(stageKey, node.scrollLeft);
      return;
    }

    delete scrollerRefs.current[stageKey];
  };

  const syncRoundHeaderTrack = (stageKey: string, scrollLeft: number): void => {
    const headerTrack = headerTrackRefs.current[stageKey];
    if (!headerTrack) return;
    headerTrack.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`;
  };

  const setHeaderTrackRef = (stageKey: string, node: HTMLDivElement | null): void => {
    if (node) {
      headerTrackRefs.current[stageKey] = node;
      syncRoundHeaderTrack(stageKey, scrollerRefs.current[stageKey]?.scrollLeft || 0);
      return;
    }

    delete headerTrackRefs.current[stageKey];
  };

  const updateStageZoom = (stageKey: string, delta: number): void => {
    setZoomLevels((current) => ({
      ...current,
      [stageKey]: clampZoom((current[stageKey] || DEFAULT_STAGE_ZOOM) + delta),
    }));
  };

  const resetStageZoom = (stageKey: string): void => {
    setZoomLevels((current) => ({
      ...current,
      [stageKey]: DEFAULT_STAGE_ZOOM,
    }));
  };

  const selectTournamentTab = (stageKey: string): void => {
    setActiveStageKey(stageKey);
    if (!bracket || typeof window === "undefined") return;

    // The view-state effect cleans up after the tab change; persist afterward so its
    // previous active key cannot overwrite the new selection.
    window.setTimeout(() => {
      const savedView = readSavedTournamentView(bracket.id) || {};
      window.sessionStorage.setItem(
        getTournamentViewStorageKey(bracket.id),
        JSON.stringify({ ...savedView, activeStageKey: stageKey }),
      );
    }, 0);
  };

  const setStageStartRound = (stageKey: string, roundName: string): void => {
    setStartRounds((current) => ({
      ...current,
      [stageKey]: roundName,
    }));

    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      const scroller = scrollerRefs.current[stageKey];
      if (!scroller) return;
      scroller.scrollTo({ left: 0, top: 0, behavior: "auto" });
      syncRoundHeaderTrack(stageKey, 0);
    });
  };

  const handleScrollerScroll = (stageKey: string, event: ReactUIEvent<HTMLDivElement>): void => {
    syncRoundHeaderTrack(stageKey, event.currentTarget.scrollLeft);
  };

  const scrollToComments = (event: ReactMouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const commentsSection = document.getElementById("tournament-comments");
    if (!commentsSection) return;

    event.preventDefault();
    window.history.replaceState(null, "", "#tournament-comments");
    commentsSection.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };

  const openMatchPage = useCallback(
    (match: TournamentMatch): void => {
      const matchId = String(match.match_id || "").trim();
      if (!matchId) return;

      if (isExternalMatchUrl(matchId)) {
        window.location.assign(matchId);
        return;
      }

      void navigate({
        to: "/matches/$matchId",
        params: { matchId },
      });
    },
    [navigate],
  );

  const shouldSuppressMatchClick = (): boolean => {
    if (!suppressNextMatchClickRef.current) return false;
    suppressNextMatchClickRef.current = false;
    return true;
  };

  const isPointerOnNativeScrollbar = (element: HTMLElement, event: ReactPointerEvent): boolean => {
    const rect = element.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const verticalScrollbarWidth = element.offsetWidth - element.clientWidth;
    const horizontalScrollbarHeight = element.offsetHeight - element.clientHeight;

    return (
      (verticalScrollbarWidth > 0 && localX >= element.clientWidth) ||
      (horizontalScrollbarHeight > 0 && localY >= element.clientHeight)
    );
  };

  const handleScrollerPointerDown = (
    stageKey: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    // Touch scrolling is deliberately left to the browser so mobile gets native
    // momentum, gesture arbitration, and compositor-thread scrolling.
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (isInteractivePointerTarget(event.target)) return;
    if (isPointerOnNativeScrollbar(event.currentTarget, event)) return;

    const currentTarget = event.currentTarget;
    dragStateRef.current = {
      stageKey,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: currentTarget.scrollLeft,
      startScrollTop: currentTarget.scrollTop,
      moved: false,
    };
    setDraggingStage(stageKey);
  };

  const handleScrollerPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved) {
      if (Math.abs(deltaX) <= 4 && Math.abs(deltaY) <= 4) return;
      dragState.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    event.currentTarget.scrollLeft = dragState.startScrollLeft - deltaX;
    const targetScrollTop = dragState.startScrollTop - deltaY;
    const maxInternalScrollTop = Math.max(
      0,
      event.currentTarget.scrollHeight - event.currentTarget.clientHeight,
    );
    const clampedScrollTop = Math.min(maxInternalScrollTop, Math.max(0, targetScrollTop));
    event.currentTarget.scrollTop = clampedScrollTop;
  };

  const endScrollerDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    suppressNextMatchClickRef.current = dragState.moved;
    if (dragState.moved && typeof window !== "undefined") {
      window.setTimeout(() => {
        suppressNextMatchClickRef.current = false;
      }, 0);
    }
    dragStateRef.current = null;
    setDraggingStage("");
  };

  if (bracketLoading) {
    return <RouteLoadingFallback />;
  }

  if (bracketError) {
    return <TournamentStateMessage title="Unable to load tournament" message={bracketError} />;
  }

  if (!bracket) {
    return (
      <TournamentStateMessage
        title="Tournament not available"
        message="This archive has not been published yet."
      />
    );
  }

  const heading = tournamentHeading(bracket);
  const seoTitle = bracket.title;

  return (
    <div className="tournamentPage">
      <Seo
        title={seoTitle}
        description={`View the ${bracket.title} tournament bracket and match archive.`}
        path={`/tournaments/${bracket.id}`}
      />

      <section className="tournamentPageHero">
        <div className="tournamentPageHeroCopy">
          <div className="tournamentHeroTopRow">
            <Link className="tournamentBackLink" to="/tournaments">
              All tournaments
            </Link>
            <div className="tournamentYearNav" aria-label="Tournament years">
              {adjacentTournaments.previous ? (
                <Link
                  className="tournamentYearNavLink"
                  to="/tournaments/$tournamentId"
                  params={{
                    tournamentId: getTournamentRouteId(adjacentTournaments.previous.id),
                  }}
                >
                  ← {adjacentTournaments.previous.year}
                </Link>
              ) : (
                <span className="tournamentYearNavSpacer" aria-hidden="true" />
              )}
              <span className="tournamentYearNavCurrent" aria-current="page">
                {bracket.year}
              </span>
              {adjacentTournaments.next ? (
                <Link
                  className="tournamentYearNavLink"
                  to="/tournaments/$tournamentId"
                  params={{ tournamentId: getTournamentRouteId(adjacentTournaments.next.id) }}
                >
                  {adjacentTournaments.next.year} →
                </Link>
              ) : (
                <span className="tournamentYearNavSpacer" aria-hidden="true" />
              )}
            </div>
          </div>
          <h1>{heading}</h1>
          {bracket.startDate ? (
            <span className="tournamentStartDate">
              {formatCalendarDateRange(bracket.startDate, bracket.endDate)}
            </span>
          ) : null}
        </div>
        {bracket.trophyAssetPath ? (
          <img
            className="tournamentPageTrophy"
            src={appAssetPath(bracket.trophyAssetPath)}
            alt=""
            width="152"
            height="152"
            loading="eager"
            decoding="async"
            aria-hidden="true"
          />
        ) : null}
      </section>

      <div className="tournamentBracketToolbar">
        <div className="tournamentBracketControls">
          {bracket.stages.length > 1 || seedEntries.length ? (
            <div className="tournamentStageToggle" role="tablist" aria-label="Bracket type">
              {bracket.stages.map((stage) => {
                const isActive = stage.key === activeStageKey;
                return (
                  <button
                    key={`${stage.key}-toggle`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`tournamentStageToggleButton${isActive ? " isActive" : ""}`}
                    onClick={() => selectTournamentTab(stage.key)}
                  >
                    {stage.label}
                  </button>
                );
              })}
              {seedEntries.length ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeStageKey === SEEDS_STAGE_KEY}
                  className={`tournamentStageToggleButton${activeStageKey === SEEDS_STAGE_KEY ? " isActive" : ""}`}
                  onClick={() => selectTournamentTab(SEEDS_STAGE_KEY)}
                >
                  Seeds
                </button>
              ) : null}
            </div>
          ) : null}
          {activeStage ? (
            <TournamentZoomControls
              stageLabel={activeStage.label}
              zoomLevel={clampZoom(zoomLevels[activeStage.key] || DEFAULT_STAGE_ZOOM)}
              onZoomOut={() => updateStageZoom(activeStage.key, -STAGE_ZOOM_STEP)}
              onZoomReset={() => resetStageZoom(activeStage.key)}
              onZoomIn={() => updateStageZoom(activeStage.key, STAGE_ZOOM_STEP)}
            />
          ) : null}
        </div>
        <a
          className="tournamentCommentsLink"
          href="#tournament-comments"
          aria-label={`Jump to comments for ${bracket.title}`}
          onClick={scrollToComments}
        >
          <FontAwesomeIcon icon={faComment} aria-hidden="true" />
          <span>Comments</span>
        </a>
      </div>

      <div className="tournamentStages">
        {visibleStages.map((stage) => {
          const zoomLevel = clampZoom(zoomLevels[stage.key] || DEFAULT_STAGE_ZOOM);
          const startRoundName = getStageStartRound(stage, startRounds);

          return (
            <TournamentStageSection
              key={stage.key}
              stage={stage}
              layout={stageLayouts.get(stage.key)}
              zoomLevel={zoomLevel}
              isDragging={draggingStage === stage.key}
              startRoundName={startRoundName}
              topSeedMap={topSeedMap}
              seedCount={topSeedMap.size}
              countryMap={countryMap}
              trophyAssetPath={bracket.trophyAssetPath}
              decisiveMatchId={decisiveMatchId}
              hideStartRoundControls={Boolean(bracket.hideStartRoundControls)}
              shouldSuppressMatchClick={shouldSuppressMatchClick}
              onOpenMatch={openMatchPage}
              onStartRoundChange={(roundName) => setStageStartRound(stage.key, roundName)}
              setHeaderTrackRef={setHeaderTrackRef}
              setScrollerRef={setScrollerRef}
              onScrollerScroll={handleScrollerScroll}
              onPointerDown={handleScrollerPointerDown}
              onPointerMove={handleScrollerPointerMove}
              onPointerEnd={endScrollerDrag}
            />
          );
        })}
        {activeStageKey === SEEDS_STAGE_KEY && seedEntries.length ? (
          <TournamentSeeds seeds={seedEntries} countryMap={countryMap} />
        ) : null}
      </div>

      <div id="tournament-comments" className="tournamentCommentsSection">
        <CommunityDiscussion target={{ type: "tournament", id: bracket.id }} />
      </div>
    </div>
  );
};

export const TournamentPage = ({ tournamentId }: { tournamentId: string }) => {
  if (tournamentId === "wolfarena2026" || tournamentId === "wr-arena2026") {
    return <WolfarenaTournamentPage />;
  }
  if (tournamentId === "acl-s1") {
    return <AtomicChessLeaguePage key="acl-s1" seasonNumber={1} />;
  }
  if (tournamentId === "acl-s2" || tournamentId === "atomicchessleague" || tournamentId === "acl") {
    return <AtomicChessLeaguePage key="acl-s2" seasonNumber={2} />;
  }
  return <BracketTournamentPage tournamentId={tournamentId} />;
};
