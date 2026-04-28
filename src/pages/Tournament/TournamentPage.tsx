import { Link } from "@tanstack/react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Seo } from "../../components/Seo/Seo";
import {
  getAdjacentTournamentMetas,
  getTournamentBracket,
  type TournamentBracket,
  type TournamentBracketStage,
  type TournamentMatch,
} from "../../lib/matches/tournaments";
import { normalizeUsername } from "../../utils/playerNames";
import "./TournamentPage.css";

type StageKey = string;

type StageLayout = {
  rounds: TournamentBracketStage["rounds"];
  width: number;
  height: number;
  positionedMatches: PositionedMatch[];
  connectors: Array<{ key: string; d: string }>;
} | null;

type PositionedMatch = TournamentMatch & {
  x: number;
  y: number;
  roundIndex: number;
};

type AnchorPoint = { x: number; y: number; anchorY: number };

const roundRangeLabel = (roundName: string): string => `Start at ${roundName}`;
const hiddenStartRoundsByStage: Record<string, Set<string>> = {
  main: new Set(["Semifinals", "Finals", "Grand Final", "Grand Final Reset"]),
  losers: new Set(["Round 4", "Round 5", "Final"]),
};
const CARD_WIDTH = 238;
const CARD_HEIGHT = 102;
const COLUMN_GAP = 78;
const LEAF_GAP = 30;
const BOARD_PADDING = 18;
const HEADER_SPACE = 64;
const DEFAULT_STAGE_ZOOM = 1;
const MIN_STAGE_ZOOM = 0.55;
const MAX_STAGE_ZOOM = 1.35;
const STAGE_ZOOM_STEP = 0.15;
const TOURNAMENT_VIEW_STORAGE_KEY = "tournament-view:";

const buildStartRoundState = (stages: TournamentBracketStage[] = []): Record<string, string> =>
  Object.fromEntries(stages.map((stage) => [stage.key, stage.rounds[0]?.roundName || ""]));

const buildZoomState = (stages: TournamentBracketStage[] = []): Record<string, number> =>
  Object.fromEntries(stages.map((stage) => [stage.key, DEFAULT_STAGE_ZOOM]));

const getStageStartRound = (stage: TournamentBracketStage, startRounds: Record<string, string>): string =>
  startRounds[stage.key] || stage.rounds[0]?.roundName || "";

const clampZoom = (zoomLevel: unknown): number =>
  Math.min(MAX_STAGE_ZOOM, Math.max(MIN_STAGE_ZOOM, Number(zoomLevel) || DEFAULT_STAGE_ZOOM));

const getTournamentViewStorageKey = (tournamentId: string): string => `${TOURNAMENT_VIEW_STORAGE_KEY}${tournamentId}`;

const getVisibleRounds = (stage: TournamentBracketStage, startRoundName: string): TournamentBracketStage["rounds"] => {
  const startIndex = stage.rounds.findIndex((round) => round.roundName === startRoundName);
  return stage.rounds.slice(Math.max(0, startIndex));
};

const getConnectorPath = (from: AnchorPoint, to: AnchorPoint): string => {
  const fromY = from.anchorY;
  const toY = to.anchorY;
  const elbowX = from.x + CARD_WIDTH + COLUMN_GAP / 2;

  return [
    `M ${from.x + CARD_WIDTH} ${fromY}`,
    `L ${elbowX} ${fromY}`,
    `L ${elbowX} ${toY}`,
    `L ${to.x} ${toY}`,
  ].join(" ");
};

const buildStageTreeLayout = (stage: TournamentBracketStage, startRoundName: string): StageLayout => {
  const rounds = getVisibleRounds(stage, startRoundName);
  if (!rounds.length) return null;

  const incoming = new Map<string, string[]>();
  const matchesByKey = new Map<string, TournamentMatch>();

  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      matchesByKey.set(match.id, match);
    });
  });

  rounds.forEach((round) => {
    round.matches.forEach((match) => {
      if (!match.winner_to || !matchesByKey.has(match.winner_to)) return;
      const existing = incoming.get(match.winner_to) || [];
      existing.push(match.id);
      incoming.set(match.winner_to, existing);
    });
  });

  const positionedMatches: PositionedMatch[] = [];
  const positions = new Map<string, AnchorPoint>();
  const connectors: Array<{ key: string; d: string }> = [];
  let maxY = 0;

  rounds.forEach((round, roundIndex) => {
    const x = BOARD_PADDING + roundIndex * (CARD_WIDTH + COLUMN_GAP);
    round.matches.forEach((match, matchIndex) => {
      const feederKeys = incoming.get(match.id) || [];
      const feederCenters = feederKeys
        .map((key) => positions.get(key))
        .filter((p): p is AnchorPoint => Boolean(p))
        .map((position) => position.y + CARD_HEIGHT / 2);

      const fallbackY = HEADER_SPACE + BOARD_PADDING + matchIndex * (CARD_HEIGHT + LEAF_GAP);
      const y =
        feederCenters.length > 0
          ? feederCenters.reduce((sum, value) => sum + value, 0) / feederCenters.length -
            CARD_HEIGHT / 2
          : fallbackY;

      const position = {
        x,
        y,
        anchorY: y + CARD_HEIGHT / 2,
      };
      positions.set(match.id, position);
      positionedMatches.push({ ...match, x, y, roundIndex });
      maxY = Math.max(maxY, y + CARD_HEIGHT);
    });
  });

  positionedMatches.forEach((match) => {
    if (!match.winner_to) return;
    const from = positions.get(match.id);
    const to = positions.get(match.winner_to);
    if (!from || !to) return;

    connectors.push({
      key: `${match.id}-${match.winner_to}`,
      d: getConnectorPath(from, to),
    });
  });

  return {
    rounds,
    width:
      BOARD_PADDING * 2 +
      rounds.length * CARD_WIDTH +
      Math.max(0, rounds.length - 1) * COLUMN_GAP,
    height: maxY + BOARD_PADDING,
    positionedMatches,
    connectors,
  };
};

const winnerName = (match: TournamentMatch): string => {
  if (match.s1 > match.s2) return match.p1;
  if (match.s2 > match.s1) return match.p2;
  return "Draw";
};

const isByePlayer = (playerName: string): boolean => String(playerName || "").trim().toLowerCase() === "bye";

const isByeMatch = (match: TournamentMatch | null | undefined): boolean =>
  isByePlayer(match?.p1 ?? "") || isByePlayer(match?.p2 ?? "");

const isWithdrawalScore = (leftScore: number, rightScore: number): boolean =>
  (leftScore === 1 && rightScore === 0) || (leftScore === 0 && rightScore === 1);

const scoreDisplay = (score: number | string): string => String(score);
const withdrewPlayerName = (match: TournamentMatch): string => {
  if (isByeMatch(match) || !isWithdrawalScore(match.s1, match.s2)) return "";
  return match.s1 < match.s2 ? match.p1 : match.p2;
};
const scoreSlotDisplay = (match: TournamentMatch, playerName: string): string => {
  if (isByeMatch(match)) {
    return "";
  }

  if (!isWithdrawalScore(match.s1, match.s2)) {
    return playerName === match.p1 ? scoreDisplay(match.s1) : scoreDisplay(match.s2);
  }

  return withdrewPlayerName(match) === playerName ? "w/o" : "—";
};
const PLAYER_NAME_TRUNCATION_LIMIT = 13;
const isExternalMatchUrl = (value: string): boolean => /^https?:\/\//i.test(String(value || "").trim());
const getMatchHref = (matchId: string): string => {
  const normalized = String(matchId || "").trim();
  if (!normalized) return "";
  return isExternalMatchUrl(normalized) ? normalized : `/matches/blitz/${normalized}`;
};

const getBracketDisplayName = (playerName: string): string => {
  const name = String(playerName || "");
  if (name.length <= PLAYER_NAME_TRUNCATION_LIMIT) return name;

  const prefix = name.slice(0, PLAYER_NAME_TRUNCATION_LIMIT + 1);
  const lastDelimiterIndex = Math.max(prefix.lastIndexOf("_"), prefix.lastIndexOf("-"));

  return lastDelimiterIndex > 0 ? name.slice(0, lastDelimiterIndex) : name;
};

const SeedBadge = ({ seed }: { seed?: number | null | undefined }) =>
  seed ? <span className="tournamentSeedBadge">({seed})</span> : null;

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

const PlayerLabel = ({
  playerName,
  seed,
  isWinner,
  countryCode,
}: {
  playerName: string;
  seed?: number | null | undefined;
  isWinner: boolean;
  countryCode?: string | null | undefined;
}) => (
  <span className="tournamentPlayerLabel">
    <img
      className="tournamentPlayerFlag"
      src={countryCodeToFlagUrl(countryCode)}
      alt=""
      loading="lazy"
      decoding="async"
      aria-hidden="true"
    />
    <Link
      className="tournamentPlayerLink"
      to="/@/$username"
      params={{ username: normalizeUsername(playerName) }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      title={playerName}
    >
      {getBracketDisplayName(playerName)}
    </Link>
    <SeedBadge seed={seed} />
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

const TournamentMatchCard = ({
  match,
  topSeedMap,
  countryMap,
}: {
  match: PositionedMatch;
  topSeedMap: Map<string, number>;
  countryMap: Map<string, string>;
}) => {
  const matchWinner = winnerName(match);
  const withdrawalPlayer = withdrewPlayerName(match);
  const hasMatchPage = Boolean(match.match_id);
  const matchHref = getMatchHref(match.match_id);

  return (
    <div
      className={`tournamentMatchCard tournamentMatchCardTree${hasMatchPage ? " isClickable" : ""}`}
      style={{
        left: `${match.x}px`,
        top: `${match.y}px`,
        width: `${CARD_WIDTH}px`,
      }}
      onPointerDown={hasMatchPage ? (event) => event.stopPropagation() : undefined}
      onClick={
        hasMatchPage
          ? () => {
              window.open(matchHref, "_blank", "noopener,noreferrer");
            }
          : undefined
      }
    >
      <div className="tournamentMatchPlayers">
        <div>
          <span>
            <PlayerLabel
              playerName={match.p1}
              seed={topSeedMap.get(match.p1)}
              isWinner={matchWinner === match.p1}
              countryCode={countryMap.get(match.p1)}
            />
          </span>
          <strong className={withdrawalPlayer === match.p1 ? "tournamentScoreWithdrawal" : ""}>
            {scoreSlotDisplay(match, match.p1)}
          </strong>
        </div>
        <div>
          <span>
            <PlayerLabel
              playerName={match.p2}
              seed={topSeedMap.get(match.p2)}
              isWinner={matchWinner === match.p2}
              countryCode={countryMap.get(match.p2)}
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

const TournamentStageSection = ({
  stage,
  layout,
  zoomLevel,
  isDragging,
  startRoundName,
  topSeedMap,
  countryMap,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onStartRoundChange,
  setScrollerRef,
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
  countryMap: Map<string, string>;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onStartRoundChange: (roundName: string) => void;
  setScrollerRef: (stageKey: StageKey, node: HTMLDivElement | null) => void;
  onPointerDown: (stageKey: StageKey, event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) => {
  const visibleRoundOptions = stage.rounds.filter(
    (round) => !hiddenStartRoundsByStage[stage.key]?.has(round.roundName),
  );

  return (
    <section className="tournamentStageSection" aria-labelledby={`${stage.key}-heading`}>
      <div className="tournamentStageHeader">
        <h2 id={`${stage.key}-heading`}>{stage.label}</h2>
        <div className="tournamentStageHeaderActions">
          {stage.key === "main" ? (
            <div className="tournamentZoomControls" role="group" aria-label={`Zoom controls for ${stage.label}`}>
              <button
                type="button"
                className="tournamentZoomButton"
                onClick={onZoomOut}
                aria-label={`Zoom out ${stage.label}`}
              >
                -
              </button>
              <button
                type="button"
                className="tournamentZoomValue"
                onClick={onZoomReset}
                aria-label={`Reset zoom for ${stage.label}`}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                className="tournamentZoomButton"
                onClick={onZoomIn}
                aria-label={`Zoom in ${stage.label}`}
              >
                +
              </button>
            </div>
          ) : null}
          <div className="tournamentStageControls" role="group" aria-label={`Starting round for ${stage.label}`}>
            {visibleRoundOptions.map((round) => {
              const isActive = startRoundName === round.roundName;
              return (
                <button
                  key={`${stage.key}-${round.roundName}-filter`}
                  type="button"
                  className={`tournamentRoundFilter${isActive ? " isActive" : ""}`}
                  onClick={() => onStartRoundChange(round.roundName)}
                >
                  {roundRangeLabel(round.roundName)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div
        className={`tournamentRoundsScroller${isDragging ? " isDragging" : ""}${stage.key === "main" ? " isMainBracket" : ""}`}
        ref={(node) => setScrollerRef(stage.key, node)}
        onPointerDown={(event) => onPointerDown(stage.key, event)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
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
                  <path key={connector.key} d={connector.d} />
                ))}
              </svg>

              {layout.rounds.map((round, roundIndex) => (
                <div
                  key={`${stage.key}-${round.roundName}`}
                  className="tournamentRoundHeader tournamentRoundHeaderFloating"
                  style={{
                    left: `${BOARD_PADDING + roundIndex * (CARD_WIDTH + COLUMN_GAP)}px`,
                    top: "0px",
                    width: `${CARD_WIDTH}px`,
                  }}
                >
                  <span>{round.roundName}</span>
                </div>
              ))}

              {layout.positionedMatches.map((match) => (
                <TournamentMatchCard
                  key={match.id}
                  match={match}
                  topSeedMap={topSeedMap}
                  countryMap={countryMap}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export const TournamentPage = ({ tournamentId }: { tournamentId: string }) => {
  const adjacentTournaments = useMemo(
    () => getAdjacentTournamentMetas(tournamentId),
    [tournamentId],
  );
  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [bracketLoading, setBracketLoading] = useState(true);
  const [bracketError, setBracketError] = useState("");
  const [startRounds, setStartRounds] = useState<Record<string, string>>({});
  const [zoomLevels, setZoomLevels] = useState<Record<string, number>>({});
  const [activeStageKey, setActiveStageKey] = useState<string>("main");
  const [draggingStage, setDraggingStage] = useState<string>("");
  type DragState = {
    stageKey: string;
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    startWindowScrollY: number;
    moved: boolean;
  };
  const dragStateRef = useRef<DragState | null>(null);
  const scrollerRefs = useRef<Record<string, HTMLDivElement>>({});
  const pendingRestoreRef = useRef<{
    scrollPositions: Record<string, { left?: number; top?: number }>;
    pageScrollY: number;
  } | null>(null);

  const saveViewState = () => {
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
  };

  useEffect(() => {
    let cancelled = false;

    setBracketLoading(true);
    setBracketError("");

    getTournamentBracket(tournamentId)
      .then((data) => {
        if (cancelled) return;
        setBracket(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setBracket(null);
        setBracketError(error?.message || "Unable to load tournament");
      })
      .finally(() => {
        if (!cancelled) {
          setBracketLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  useEffect(() => {
    if (!bracket) return;

    const defaultStartRounds = buildStartRoundState(bracket.stages || []);
    const defaultZoomLevels = buildZoomState(bracket.stages || []);
    const savedView =
      typeof window !== "undefined"
        ? JSON.parse(window.sessionStorage.getItem(getTournamentViewStorageKey(bracket.id)) || "null")
        : null;
    const availableStageKeys = new Set((bracket.stages || []).map((stage) => stage.key));
    const defaultActiveStageKey = availableStageKeys.has("main")
      ? "main"
      : bracket.stages[0]?.key || "";
    const savedActiveStageKey = String(savedView?.activeStageKey || "").trim();

    setStartRounds({ ...defaultStartRounds, ...(savedView?.startRounds || {}) });
    setZoomLevels({ ...defaultZoomLevels, ...(savedView?.zoomLevels || {}) });
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
  }, [bracket, startRounds, zoomLevels]);

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
  const countryMap = useMemo(
    () => new Map(Object.entries(bracket?.countryMap || {})),
    [bracket],
  );
  const visibleStages = useMemo(
    () => bracket?.stages?.filter((stage) => stage.key === activeStageKey) || [],
    [bracket, activeStageKey],
  );

  const setScrollerRef = (stageKey: string, node: HTMLDivElement | null): void => {
    if (node) {
      scrollerRefs.current[stageKey] = node;
      return;
    }

    delete scrollerRefs.current[stageKey];
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

  const setStageStartRound = (stageKey: string, roundName: string): void => {
    setStartRounds((current) => ({
      ...current,
      [stageKey]: roundName,
    }));
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

  const handleScrollerPointerDown = (stageKey: string, event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isPointerOnNativeScrollbar(event.currentTarget, event)) return;

    const currentTarget = event.currentTarget;
    dragStateRef.current = {
      stageKey,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: currentTarget.scrollLeft,
      startScrollTop: currentTarget.scrollTop,
      startWindowScrollY: typeof window !== "undefined" ? window.scrollY : 0,
      moved: false,
    };
    setDraggingStage(stageKey);
    currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleScrollerPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) dragState.moved = true;

    event.currentTarget.scrollLeft = dragState.startScrollLeft - deltaX;
    const targetScrollTop = dragState.startScrollTop - deltaY;
    const maxInternalScrollTop = Math.max(0, event.currentTarget.scrollHeight - event.currentTarget.clientHeight);
    const clampedScrollTop = Math.min(maxInternalScrollTop, Math.max(0, targetScrollTop));
    event.currentTarget.scrollTop = clampedScrollTop;

    if (typeof window !== "undefined" && maxInternalScrollTop <= 1) {
      window.scrollTo({
        top: Math.max(0, dragState.startWindowScrollY - deltaY),
        left: window.scrollX,
        behavior: "auto",
      });
    }
  };

  const endScrollerDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStateRef.current = null;
    setDraggingStage("");
  };

  if (bracketLoading) {
    return <TournamentStateMessage title="Loading tournament…" message="Fetching bracket data from Supabase." />;
  }

  if (bracketError) {
    return <TournamentStateMessage title="Unable to load tournament" message={bracketError} />;
  }

  if (!bracket) {
    return <TournamentStateMessage title="Tournament not available" message="This archive has not been published yet." />;
  }

  return (
    <div className="tournamentPage">
      <Seo
        title={`${bracket.title} Bracket`}
        description={`View the ${bracket.title} bracket, including the championship, losers bracket, and grand final.`}
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
                  params={{ tournamentId: adjacentTournaments.previous.id }}
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
                  params={{ tournamentId: adjacentTournaments.next.id }}
                >
                  {adjacentTournaments.next.year} →
                </Link>
              ) : (
                <span className="tournamentYearNavSpacer" aria-hidden="true" />
              )}
            </div>
          </div>
          <span className="tournamentPageEyebrow">Interactive bracket</span>
          <h1>{`Atomic World Championship ${bracket.year}`}</h1>
        </div>
      </section>

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
              onClick={() => setActiveStageKey(stage.key)}
            >
              {stage.label}
            </button>
          );
        })}
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
              countryMap={countryMap}
              onZoomOut={() => updateStageZoom(stage.key, -STAGE_ZOOM_STEP)}
              onZoomReset={() => resetStageZoom(stage.key)}
              onZoomIn={() => updateStageZoom(stage.key, STAGE_ZOOM_STEP)}
              onStartRoundChange={(roundName) => setStageStartRound(stage.key, roundName)}
              setScrollerRef={setScrollerRef}
              onPointerDown={handleScrollerPointerDown}
              onPointerMove={handleScrollerPointerMove}
              onPointerEnd={endScrollerDrag}
            />
          );
        })}
      </div>
    </div>
  );
};
