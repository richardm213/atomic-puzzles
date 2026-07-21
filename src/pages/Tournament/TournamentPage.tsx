import "./TournamentPage.css";

import { faCheck, faComment, faRobot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  getAdjacentTournamentMetas,
  getTournamentBracket,
  getTournamentDecisiveMatch,
  type TournamentBracket,
  type TournamentBracketStage,
  type TournamentMatch,
} from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";

type StageKey = string;

type StageLayout = {
  rounds: TournamentBracketStage["rounds"];
  width: number;
  height: number;
  positionedMatches: PositionedMatch[];
  connectors: ConnectorSegment[];
} | null;

type PositionedMatch = TournamentMatch & {
  x: number;
  y: number;
};

type MatchPosition = { x: number; y: number };
type SourcePosition = { id: string; rightX: number; centerY: number };

type ConnectorSegment = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

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

const hiddenStartRoundsByStage: Record<string, Set<string>> = {
  main: new Set(["Grand Final", "Grand Final Reset"]),
};

const getStartRoundOptions = (stage: TournamentBracketStage): TournamentBracketStage["rounds"] =>
  stage.rounds.filter((round) => !hiddenStartRoundsByStage[stage.key]?.has(round.roundName));

const roundShortLabels: Record<string, string> = {
  "Round of 128": "R128",
  "Round of 64": "R64",
  "Round of 32": "R32",
  "Round of 16": "R16",
  Quarterfinals: "QF",
  Semifinals: "SF",
  Finals: "F",
  "Grand Final": "GF",
  "Grand Final Reset": "Reset",
  "Round 1": "R1",
  "Round 2": "R2",
  "Round 3": "R3",
  "Round 4": "R4",
  "Round 5": "R5",
  Semifinal: "SF",
  Final: "F",
  "Set 1": "Set 1",
  Reset: "Reset",
};

const getRoundShortLabel = (roundName: string): string =>
  roundShortLabels[roundName] ?? roundName.replace(/^Round\s+/i, "R");

const tournamentHeading = (bracket: TournamentBracket): string => {
  if (bracket.headingTitle) return bracket.headingTitle;
  return bracket.title.startsWith("AWC ")
    ? `Atomic World Championship ${bracket.year}`
    : bracket.title;
};
const CARD_WIDTH = 260;
const CARD_HEIGHT = 102;
const COLUMN_GAP = 78;
const LEAF_GAP = 26;
const BOARD_PADDING = 18;
const BOARD_BOTTOM_PADDING = 12;
const HEADER_SPACE = 64;
const CARD_CENTER_ANCHOR_OFFSET = CARD_HEIGHT / 2;
const DEFAULT_STAGE_ZOOM = 0.85;
const MIN_STAGE_ZOOM = 0.55;
const MAX_STAGE_ZOOM = 1.35;
const STAGE_ZOOM_STEP = 0.15;
const TOURNAMENT_VIEW_STORAGE_KEY = "tournament-view:v3:";

type SavedTournamentView = {
  startRounds?: Record<string, string>;
  zoomLevels?: Record<string, number>;
  activeStageKey?: string;
  scrollPositions?: Record<string, { left?: number; top?: number }>;
  pageScrollY?: number;
};

const buildStartRoundState = (stages: TournamentBracketStage[] = []): Record<string, string> =>
  Object.fromEntries(stages.map((stage) => [stage.key, stage.rounds[0]?.roundName || ""]));

const buildZoomState = (
  stages: TournamentBracketStage[],
  savedZoomLevels: Record<string, number> = {},
): Record<string, number> =>
  Object.fromEntries(
    stages.map((stage) => [stage.key, savedZoomLevels[stage.key] ?? DEFAULT_STAGE_ZOOM]),
  );

const getStageStartRound = (
  stage: TournamentBracketStage,
  startRounds: Record<string, string>,
): string => startRounds[stage.key] || stage.rounds[0]?.roundName || "";

const clampZoom = (zoomLevel: unknown): number =>
  Math.min(MAX_STAGE_ZOOM, Math.max(MIN_STAGE_ZOOM, Number(zoomLevel) || DEFAULT_STAGE_ZOOM));

const zoomDisplayPercent = (zoomLevel: number): number =>
  Math.round((zoomLevel / DEFAULT_STAGE_ZOOM) * 100);

const getTournamentViewStorageKey = (tournamentId: string): string =>
  `${TOURNAMENT_VIEW_STORAGE_KEY}${tournamentId}`;

const readSavedTournamentView = (tournamentId: string): SavedTournamentView | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(getTournamentViewStorageKey(tournamentId));
    if (!rawValue) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return null;
    }

    return parsedValue;
  } catch {
    window.sessionStorage.removeItem(getTournamentViewStorageKey(tournamentId));
    return null;
  }
};

const getVisibleRounds = (
  stage: TournamentBracketStage,
  startRoundName: string,
): TournamentBracketStage["rounds"] => {
  const startIndex = stage.rounds.findIndex((round) => round.roundName === startRoundName);
  return stage.rounds.slice(Math.max(0, startIndex));
};

const trophyRoundNames = new Set([
  "Final",
  "Finals",
  "Grand Final",
  "Grand Final Reset",
  "Set 1",
  "Reset",
]);

const getStageTrophyMatchId = (stage: TournamentBracketStage, decisiveMatchId: string): string => {
  const decisiveMatch = stage.rounds
    .flatMap((round) => round.matches)
    .find((match) => match.id === decisiveMatchId);
  if (decisiveMatch) return decisiveMatch.id;
  if (stage.key !== "main") return "";

  const finalRound =
    [...stage.rounds].reverse().find((round) => trophyRoundNames.has(round.roundName)) ??
    stage.rounds.at(-1);

  return finalRound?.matches.at(-1)?.id ?? "";
};

const createConnector = (
  key: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ConnectorSegment => ({ key, x1, y1, x2, y2 });

const buildStageTreeLayout = (
  stage: TournamentBracketStage,
  startRoundName: string,
): StageLayout => {
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
  const positions = new Map<string, MatchPosition>();
  const connectors: ConnectorSegment[] = [];
  let maxY = 0;

  rounds.forEach((round, roundIndex) => {
    const x = BOARD_PADDING + roundIndex * (CARD_WIDTH + COLUMN_GAP);
    round.matches.forEach((match, matchIndex) => {
      const feederKeys = incoming.get(match.id) || [];
      const feederCenters = feederKeys
        .map((key) => positions.get(key))
        .filter((p): p is MatchPosition => Boolean(p))
        .map((position) => position.y + CARD_CENTER_ANCHOR_OFFSET);

      const fallbackY = HEADER_SPACE + BOARD_PADDING + matchIndex * (CARD_HEIGHT + LEAF_GAP);
      const y =
        feederCenters.length > 0
          ? feederCenters.reduce((sum, value) => sum + value, 0) / feederCenters.length -
            CARD_CENTER_ANCHOR_OFFSET
          : fallbackY;

      const position = {
        x,
        y,
      };
      positions.set(match.id, position);
      positionedMatches.push({ ...match, x, y });
      maxY = Math.max(maxY, y + CARD_HEIGHT);
    });
  });

  incoming.forEach((sourceMatchIds, targetMatchId) => {
    const targetPosition = positions.get(targetMatchId);
    if (!targetPosition) return;

    const sourcePositions = sourceMatchIds
      .map((sourceMatchId) => {
        const position = positions.get(sourceMatchId);
        if (!position) return null;
        return {
          id: sourceMatchId,
          rightX: position.x + CARD_WIDTH,
          centerY: position.y + CARD_CENTER_ANCHOR_OFFSET,
        };
      })
      .filter((source): source is SourcePosition => source !== null);

    if (!sourcePositions.length) return;

    const targetLeftX = targetPosition.x;
    const targetCenterY = targetPosition.y + CARD_CENTER_ANCHOR_OFFSET;

    if (sourcePositions.length === 1) {
      const source = sourcePositions[0]!;
      const elbowX = source.rightX + (targetLeftX - source.rightX) / 2;

      if (Math.abs(source.centerY - targetCenterY) < 0.5) {
        connectors.push(
          createConnector(
            `${source.id}-${targetMatchId}-straight`,
            source.rightX,
            source.centerY,
            targetLeftX,
            targetCenterY,
          ),
        );
        return;
      }

      connectors.push(
        createConnector(
          `${source.id}-${targetMatchId}-source-arm`,
          source.rightX,
          source.centerY,
          elbowX,
          source.centerY,
        ),
        createConnector(
          `${source.id}-${targetMatchId}-elbow`,
          elbowX,
          source.centerY,
          elbowX,
          targetCenterY,
        ),
        createConnector(
          `${source.id}-${targetMatchId}-target-arm`,
          elbowX,
          targetCenterY,
          targetLeftX,
          targetCenterY,
        ),
      );
      return;
    }

    const junctionX = sourcePositions[0]!.rightX + (targetLeftX - sourcePositions[0]!.rightX) / 2;
    const sourceYValues = [...sourcePositions.map((source) => source.centerY), targetCenterY];
    const minSourceY = Math.min(...sourceYValues);
    const maxSourceY = Math.max(...sourceYValues);

    sourcePositions.forEach((source) => {
      connectors.push(
        createConnector(
          `${source.id}-${targetMatchId}-source-arm`,
          source.rightX,
          source.centerY,
          junctionX,
          source.centerY,
        ),
      );
    });

    connectors.push(
      createConnector(`${targetMatchId}-merge-spine`, junctionX, minSourceY, junctionX, maxSourceY),
      createConnector(
        `${targetMatchId}-target-arm`,
        junctionX,
        targetCenterY,
        targetLeftX,
        targetCenterY,
      ),
    );
  });

  return {
    rounds,
    width:
      BOARD_PADDING * 2 + rounds.length * CARD_WIDTH + Math.max(0, rounds.length - 1) * COLUMN_GAP,
    height: maxY + BOARD_BOTTOM_PADDING,
    positionedMatches,
    connectors,
  };
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
  return Boolean(
    target.closest(
      "a, button, input, select, textarea, [role='button'], [role='link'], .tournamentMatchCardTree.isClickable",
    ),
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
  onZoomOut,
  onZoomReset,
  onZoomIn,
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
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
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
        <div
          className="tournamentZoomControls"
          role="group"
          aria-label={`Zoom controls for ${stage.label}`}
        >
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
            {zoomDisplayPercent(zoomLevel)}%
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

export const TournamentPage = ({ tournamentId }: { tournamentId: string }) => {
  const navigate = useNavigate();
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
    const savedView = readSavedTournamentView(bracket.id);
    const availableStageKeys = new Set((bracket.stages || []).map((stage) => stage.key));
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
  const decisiveMatchId = useMemo(() => getTournamentDecisiveMatch(bracket)?.id || "", [bracket]);
  const visibleStages = useMemo(
    () => bracket?.stages?.filter((stage) => stage.key === activeStageKey) || [],
    [bracket, activeStageKey],
  );

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
        to: "/matches/$mode/$matchId",
        params: { mode: bracket?.matchMode ?? "blitz", matchId },
      });
    },
    [bracket?.matchMode, navigate],
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
    if (event.pointerType === "mouse" && event.button !== 0) return;
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
    const maxInternalScrollTop = Math.max(
      0,
      event.currentTarget.scrollHeight - event.currentTarget.clientHeight,
    );
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
  const seoTitle = bracket.id.startsWith("ahc") ? `${heading} Bracket` : heading;

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
          <h1>{heading}</h1>
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
        {bracket.stages.length > 1 ? (
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
        ) : null}
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
              onZoomOut={() => updateStageZoom(stage.key, -STAGE_ZOOM_STEP)}
              onZoomReset={() => resetStageZoom(stage.key)}
              onZoomIn={() => updateStageZoom(stage.key, STAGE_ZOOM_STEP)}
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
      </div>

      <div id="tournament-comments" className="tournamentCommentsSection">
        <CommunityDiscussion
          target={{ type: "tournament", id: bracket.id }}
          eyebrow="Tournament community"
          heading={`${bracket.title} discussion`}
        />
      </div>
    </div>
  );
};
