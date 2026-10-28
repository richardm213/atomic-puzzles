import "./TournamentPage.css";

import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  UIEvent as ReactUIEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CommunityCommentsLink } from "../../components/CommunityCommentsLink/CommunityCommentsLink";
import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { TournamentPlayerLink } from "../../components/TournamentPlayerLink/TournamentPlayerLink";
import { modeLabels } from "../../constants/matches";
import { TournamentFairPlayFlag } from "../../features/tournaments/TournamentFairPlayFlag";
import { useUnderscoreUsernameCutoff } from "../../hooks/useUnderscoreUsernameCutoff";
import {
  tournamentBracketQueryOptions,
  tournamentCatalogQueryOptions,
} from "../../lib/matches/tournamentQueries";
import {
  getAdjacentTournamentMetas,
  getTournamentDecisiveMatch,
  getTournamentRouteId,
  isTournamentByeMatch,
  isTournamentByePlayer,
  isTournamentDoubleByeMatch,
  type TournamentBracket,
  type TournamentBracketStage,
  type TournamentMatch,
} from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { setBrowserStorageItem } from "../../utils/browserStorage";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import { formatCalendarDateRange, formatTimeControl } from "../../utils/formatters";
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
  getStageRoundShortLabel,
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

const TOURNAMENT_TAB_KEYS = new Set(["main", "losers", "qualifying", SEEDS_STAGE_KEY]);

const normalizeTournamentTab = (value: string | undefined): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return TOURNAMENT_TAB_KEYS.has(normalized) ? normalized : "";
};

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
  eliminationStatus: string;
};

type TournamentEntryMarker = {
  label: "WC" | "Q";
  description: string;
};

type LoserSource = {
  label: string;
  loserName: string;
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

const loserName = (match: TournamentMatch): string => {
  const winner = winnerName(match);
  if (!winner || winner === "Draw") return "";
  return normalizeUsername(winner) === normalizeUsername(match.p1) ? match.p2 : match.p1;
};

const isEmptyPlayer = (playerName: string): boolean => String(playerName || "").trim() === "";

const byeAdvancePlayerName = (match: TournamentMatch | null | undefined): string => {
  if (!match || !isTournamentByeMatch(match) || isTournamentDoubleByeMatch(match)) return "";
  return isTournamentByePlayer(match.p1) ? match.p2 : match.p1;
};

const isEmptyMatch = (match: TournamentMatch | null | undefined): boolean =>
  isEmptyPlayer(match?.p1 ?? "") && isEmptyPlayer(match?.p2 ?? "");

const isWithdrawalScore = (leftScore: number, rightScore: number): boolean =>
  (leftScore === 1 && rightScore === 0) || (leftScore === 0 && rightScore === 1);

const scoreDisplay = (score: number | string): string => String(score);
const withdrewPlayerName = (match: TournamentMatch): string => {
  if (isTournamentByeMatch(match) || !isWithdrawalScore(match.s1, match.s2)) return "";
  return match.s1 < match.s2 ? match.p1 : match.p2;
};
const disqualifiedPlayerName = (match: TournamentMatch): string =>
  match.outcome_type === "disqualification" ? withdrewPlayerName(match) : "";
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

  if (isTournamentByeMatch(match)) {
    return "";
  }

  if (!isWithdrawalScore(match.s1, match.s2)) {
    return playerName === match.p1 ? scoreDisplay(match.s1) : scoreDisplay(match.s2);
  }

  if (withdrewPlayerName(match) !== playerName) return "—";
  return match.outcome_type === "disqualification" ? "dq" : "w/o";
};
const isExternalMatchUrl = (value: string): boolean =>
  /^https?:\/\//i.test(String(value || "").trim());

const DrawEntryBadge = ({
  seed,
  seedCount,
  marker,
}: {
  seed?: number | null | undefined;
  seedCount: number;
  marker?: TournamentEntryMarker | undefined;
}) => {
  if (!seedCount && !marker) return null;
  if (seed) {
    return (
      <span
        className={`tournamentSeedBadge${seedCount <= 8 ? " isSingleDigit" : ""}`}
        aria-label={`Seed ${seed}`}
      >
        {seed}
      </span>
    );
  }

  if (marker?.label === "WC") {
    return (
      <button
        type="button"
        className="tournamentSeedBadge tournamentEntryBadge isWildcard"
        aria-label={marker.description}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <span className="tournamentEntryBadgeLabel">WC</span>
        <span className="tournamentEntryTooltip" role="tooltip">
          <strong>Wildcard replacement</strong>
          <span>{marker.description}</span>
        </span>
      </button>
    );
  }

  return (
    <span
      className={`tournamentSeedBadge${marker ? " tournamentEntryBadge isQualifier" : ""}`}
      aria-label={marker?.description}
      aria-hidden={marker ? undefined : true}
    >
      {marker?.label || null}
    </span>
  );
};

const AdvanceCheck = () => (
  <span className="tournamentAdvanceCheck" aria-label="Advanced">
    <FontAwesomeIcon icon={faCheck} />
  </span>
);

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
  entryMarker,
  isWinner,
  countryCode,
  shouldSuppressClick,
}: {
  playerName: string;
  seed?: number | null | undefined;
  seedCount: number;
  entryMarker?: TournamentEntryMarker | undefined;
  isWinner: boolean;
  countryCode?: string | null | undefined;
  shouldSuppressClick: () => boolean;
}) => {
  const { displayName, elementRef: playerLinkRef } =
    useUnderscoreUsernameCutoff<HTMLAnchorElement>(playerName);

  return (
    <span className="tournamentPlayerLabel">
      <DrawEntryBadge seed={seed} seedCount={seedCount} marker={entryMarker} />
      {!isTournamentByePlayer(playerName) && !isEmptyPlayer(playerName) ? (
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
      ) : isTournamentByePlayer(playerName) ? (
        <span className="tournamentPlayerBye">bye</span>
      ) : (
        <Link
          ref={playerLinkRef}
          className="tournamentPlayerLink"
          to="/tournaments/players/$username"
          params={{ username: normalizeUsername(playerName) }}
          onClick={(event) => {
            if (shouldSuppressClick()) {
              event.preventDefault();
            }
            event.stopPropagation();
          }}
          title={playerName}
          aria-label={playerName}
        >
          {displayName}
        </Link>
      )}
      <TournamentFairPlayFlag playerName={playerName} />
      {isWinner ? <AdvanceCheck /> : null}
    </span>
  );
};

const isReplacementPlayer = (match: TournamentMatch, playerName: string): boolean =>
  Boolean(match.replacement_for) &&
  normalizeUsername(match.replacement_player) === normalizeUsername(playerName);

const replacementSummary = (match: TournamentMatch): string =>
  match.replacement_note ||
  `${match.replacement_player} replaced ${match.replacement_for} in the published draw.`;

const buildTournamentEntryMarkers = (
  bracket: TournamentBracket,
): Map<string, TournamentEntryMarker> => {
  const markers = new Map<string, TournamentEntryMarker>();

  bracket.matches
    .filter((match) => match.bracket === "qualifying" && !match.winner_to)
    .forEach((match) => {
      const winner = winnerName(match);
      if (!winner || winner === "Draw") return;
      markers.set(normalizeUsername(winner), {
        label: "Q",
        description: "Qualified through the qualifying draw.",
      });
    });

  bracket.matches.forEach((match) => {
    if (!match.replacement_player || !match.replacement_for) return;
    markers.set(normalizeUsername(match.replacement_player), {
      label: "WC",
      description: replacementSummary(match),
    });
  });

  return markers;
};

const eliminationRoundLabel = (roundName: string): string => {
  if (roundName === "Quarterfinals") return "quarterfinals";
  if (roundName === "Semifinals") return "semifinals";
  if (["Finals", "Grand Final", "Grand Final Reset"].includes(roundName)) return "final";
  return roundName.toLowerCase();
};

const mainDrawRoundIndex = (match: TournamentMatch): number => {
  if (match.bracket === "grand_final") {
    return match.round === "Reset" ? 9 : 8;
  }
  const roundOrder = [
    "Round of 128",
    "Round of 64",
    "Round of 32",
    "Round of 16",
    "Quarterfinals",
    "Semifinals",
    "Finals",
    "Grand Final",
    "Grand Final Reset",
  ];
  return roundOrder.indexOf(match.round);
};

const getSeedEliminationStatus = (bracket: TournamentBracket, playerName: string): string => {
  const playerKey = normalizeUsername(playerName);
  const decisiveMatch = getTournamentDecisiveMatch(bracket);
  const champion = decisiveMatch ? winnerName(decisiveMatch) : "";
  if (normalizeUsername(champion) === playerKey) return "champion";

  const losses = bracket.matches
    .filter((match) => match.bracket === "main" || match.bracket === "grand_final")
    .filter((match) =>
      [match.p1, match.p2].some((participant) => normalizeUsername(participant) === playerKey),
    )
    .filter((match) => {
      const winner = winnerName(match);
      return winner && winner !== "Draw" && normalizeUsername(winner) !== playerKey;
    })
    .sort(
      (left, right) =>
        mainDrawRoundIndex(right) - mainDrawRoundIndex(left) || right.order - left.order,
    );

  const eliminationMatch = losses[0];
  if (!eliminationMatch) return "active";

  const round = eliminationRoundLabel(
    eliminationMatch.bracket === "grand_final"
      ? eliminationMatch.round === "Reset"
        ? "Grand Final Reset"
        : "Grand Final"
      : eliminationMatch.round,
  );
  if (eliminationMatch.outcome_type === "disqualification") {
    return `${round}, disqualified`;
  }
  if (withdrewPlayerName(eliminationMatch)) {
    return `${round}, withdrew`;
  }
  return round;
};

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
      {seeds.map(({ playerName, seed, eliminationStatus }) => (
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
          <span className="tournamentSeedsIdentity">
            <TournamentPlayerLink
              className="tournamentSeedsPlayerLink"
              username={playerName}
            >
              {playerName}
            </TournamentPlayerLink>
            <TournamentFairPlayFlag playerName={playerName} />
          </span>
          <span className="tournamentSeedsResult">({eliminationStatus})</span>
        </li>
      ))}
    </ol>
  </section>
);

const TournamentMatchCard = ({
  match,
  topSeedMap,
  entryMarkers,
  seedCount,
  countryMap,
  trophyAssetPath,
  showTrophy,
  placeTrophyOnSide,
  shouldSuppressClick,
  loserSources = [],
}: {
  match: PositionedMatch;
  topSeedMap: Map<string, number>;
  entryMarkers: Map<string, TournamentEntryMarker>;
  seedCount: number;
  countryMap: Map<string, string>;
  trophyAssetPath: string | undefined;
  showTrophy: boolean;
  placeTrophyOnSide: boolean;
  shouldSuppressClick: () => boolean;
  loserSources?: LoserSource[];
}) => {
  const matchWinner = winnerName(match);
  const withdrawalPlayer = withdrewPlayerName(match);
  const disqualifiedPlayer = disqualifiedPlayerName(match);
  const hasMatchPage = Boolean(match.match_id);
  const shouldShowTrophy = showTrophy && Boolean(trophyAssetPath);
  const isDoubleBye = isTournamentDoubleByeMatch(match);
  const byeAdvancePlayer = byeAdvancePlayerName(match);
  const representedLosers = new Set(
    [match.p1, match.p2]
      .filter((playerName) => !isEmptyPlayer(playerName))
      .map((playerName) => normalizeUsername(playerName)),
  );
  const availableLoserSources = loserSources.filter(
    (source) => !source.loserName || !representedLosers.has(normalizeUsername(source.loserName)),
  );
  let nextLoserSourceIndex = 0;
  const loserSourceForPlayer = (playerName: string): LoserSource | undefined => {
    if (!isEmptyPlayer(playerName)) return undefined;
    const source = availableLoserSources[nextLoserSourceIndex];
    nextLoserSourceIndex += 1;
    return source;
  };
  const p1LoserSource = loserSourceForPlayer(match.p1);
  const p2LoserSource = loserSourceForPlayer(match.p2);
  const openMatchLabel = `Open ${match.p1} against ${match.p2}`;
  const handleOpenMatchClick = (event: ReactMouseEvent<HTMLAnchorElement>): void => {
    if (!shouldSuppressClick()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (isDoubleBye) {
    return (
      <div
        className="tournamentMatchCardTree tournamentDoubleByeAnchor"
        style={{
          left: `${match.x}px`,
          top: `${match.y}px`,
          width: `${CARD_WIDTH}px`,
        }}
        aria-hidden="true"
      />
    );
  }

  if (byeAdvancePlayer) {
    return (
      <div
        className="tournamentMatchCard tournamentMatchCardTree tournamentByeAdvance"
        style={{
          left: `${match.x}px`,
          top: `${match.y}px`,
          width: `${CARD_WIDTH}px`,
        }}
      >
        <div className="tournamentByeAdvanceCard">
          <div className="tournamentPlayerRow">
            <span>
              <PlayerLabel
                playerName={byeAdvancePlayer}
                seed={topSeedMap.get(byeAdvancePlayer)}
                seedCount={seedCount}
                entryMarker={
                  match.bracket === "qualifying"
                    ? undefined
                    : entryMarkers.get(normalizeUsername(byeAdvancePlayer))
                }
                isWinner={false}
                countryCode={countryMap.get(byeAdvancePlayer)}
                shouldSuppressClick={shouldSuppressClick}
              />
              <span className="tournamentVisuallyHidden"> advances by bye</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tournamentMatchCard tournamentMatchCardTree${hasMatchPage ? " isClickable" : ""}${shouldShowTrophy ? " hasTrophy" : ""}${shouldShowTrophy && placeTrophyOnSide ? " hasSideTrophy" : ""}${match.replacement_for ? " hasReplacementHistory" : ""}`}
      style={{
        left: `${match.x}px`,
        top: `${match.y}px`,
        width: `${CARD_WIDTH}px`,
      }}
    >
      {hasMatchPage ? (
        isExternalMatchUrl(match.match_id) ? (
          <a
            className="tournamentMatchCardOpenLink"
            href={match.match_id}
            aria-label={openMatchLabel}
            onClick={handleOpenMatchClick}
          ></a>
        ) : (
          <Link
            className="tournamentMatchCardOpenLink"
            to="/matches/$matchId"
            params={{ matchId: match.match_id }}
            aria-label={openMatchLabel}
            onClick={handleOpenMatchClick}
          ></Link>
        )
      ) : null}
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
        <div
          className={`tournamentPlayerRow${matchWinner === match.p1 ? " isWinner" : ""}${isReplacementPlayer(match, match.p1) ? " hasReplacement" : ""}`}
        >
          <span className="tournamentPlayerIdentity">
            {p1LoserSource ? (
              <span className="tournamentLoserSource" title={p1LoserSource.label}>
                {p1LoserSource.label}
              </span>
            ) : (
              <PlayerLabel
                playerName={match.p1}
                seed={topSeedMap.get(match.p1)}
                seedCount={seedCount}
                entryMarker={
                  match.bracket === "qualifying"
                    ? undefined
                    : entryMarkers.get(normalizeUsername(match.p1))
                }
                isWinner={matchWinner === match.p1}
                countryCode={countryMap.get(match.p1)}
                shouldSuppressClick={shouldSuppressClick}
              />
            )}
          </span>
          <strong
            className={
              disqualifiedPlayer === match.p1
                ? "tournamentScoreDisqualification"
                : withdrawalPlayer === match.p1
                  ? "tournamentScoreWithdrawal"
                  : ""
            }
          >
            {scoreSlotDisplay(match, match.p1)}
          </strong>
        </div>
        <div
          className={`tournamentPlayerRow${matchWinner === match.p2 ? " isWinner" : ""}${isReplacementPlayer(match, match.p2) ? " hasReplacement" : ""}`}
        >
          <span className="tournamentPlayerIdentity">
            {p2LoserSource ? (
              <span className="tournamentLoserSource" title={p2LoserSource.label}>
                {p2LoserSource.label}
              </span>
            ) : (
              <PlayerLabel
                playerName={match.p2}
                seed={topSeedMap.get(match.p2)}
                seedCount={seedCount}
                entryMarker={
                  match.bracket === "qualifying"
                    ? undefined
                    : entryMarkers.get(normalizeUsername(match.p2))
                }
                isWinner={matchWinner === match.p2}
                countryCode={countryMap.get(match.p2)}
                shouldSuppressClick={shouldSuppressClick}
              />
            )}
          </span>
          <strong
            className={
              disqualifiedPlayer === match.p2
                ? "tournamentScoreDisqualification"
                : withdrawalPlayer === match.p2
                  ? "tournamentScoreWithdrawal"
                  : ""
            }
          >
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
  entryMarkers,
  seedCount,
  countryMap,
  trophyAssetPath,
  decisiveMatchId,
  hideStartRoundControls,
  shouldSuppressMatchClick,
  onStartRoundChange,
  setHeaderTrackRef,
  setScrollerRef,
  onScrollerScroll,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  loserSourcesByMatchId,
}: {
  stage: TournamentBracketStage;
  layout: StageLayout;
  zoomLevel: number;
  isDragging: boolean;
  startRoundName: string;
  topSeedMap: Map<string, number>;
  entryMarkers: Map<string, TournamentEntryMarker>;
  seedCount: number;
  countryMap: Map<string, string>;
  trophyAssetPath: string | undefined;
  decisiveMatchId: string;
  hideStartRoundControls?: boolean;
  shouldSuppressMatchClick: () => boolean;
  onStartRoundChange: (roundName: string) => void;
  setHeaderTrackRef: (stageKey: StageKey, node: HTMLDivElement | null) => void;
  setScrollerRef: (stageKey: StageKey, node: HTMLDivElement | null) => void;
  onScrollerScroll: (stageKey: StageKey, event: ReactUIEvent<HTMLDivElement>) => void;
  onPointerDown: (stageKey: StageKey, event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  loserSourcesByMatchId: Map<string, LoserSource[]>;
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
                  {getStageRoundShortLabel(stage, round.roundName)}
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
                <span>
                  {stage.key === "qualifying"
                    ? getStageRoundShortLabel(stage, round.roundName)
                    : round.roundName}
                </span>
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
                    entryMarkers={entryMarkers}
                    seedCount={seedCount}
                    countryMap={countryMap}
                    trophyAssetPath={trophyAssetPath}
                    showTrophy={match.id === trophyMatchId}
                    placeTrophyOnSide={
                      startRoundName === "Semifinals" || startRoundName === "Finals"
                    }
                    shouldSuppressClick={shouldSuppressMatchClick}
                    loserSources={loserSourcesByMatchId.get(match.id) ?? []}
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

const BracketTournamentPage = ({
  tournamentId,
  tournamentTab,
}: {
  tournamentId: string;
  tournamentTab?: string | undefined;
}) => {
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
    ? getErrorMessage(bracketQuery.error, "Unable to load tournament")
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

    setBrowserStorageItem(
      "session",
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
    const requestedStageKey = normalizeTournamentTab(tournamentTab);
    const nextActiveStageKey =
      requestedStageKey && availableStageKeys.has(requestedStageKey)
        ? requestedStageKey
        : savedActiveStageKey && availableStageKeys.has(savedActiveStageKey)
          ? savedActiveStageKey
          : defaultActiveStageKey;

    setStartRounds({ ...defaultStartRounds, ...(savedView?.startRounds || {}) });
    setZoomLevels(buildZoomState(bracket.stages || [], savedView?.zoomLevels || {}));
    setActiveStageKey(nextActiveStageKey);
    pendingRestoreRef.current = savedView
      ? {
          scrollPositions: savedView.scrollPositions || {},
          pageScrollY: Number(savedView.pageScrollY) || 0,
        }
      : null;

    if (nextActiveStageKey && tournamentTab !== nextActiveStageKey) {
      void navigate({
        to: "/tournaments/$tournamentId/$tournamentTab",
        params: {
          tournamentId: getTournamentRouteId(bracket.id),
          tournamentTab: nextActiveStageKey,
        },
        replace: true,
      });
    }
  }, [bracket, navigate, tournamentTab]);

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
  const entryMarkers = useMemo(
    () =>
      bracket ? buildTournamentEntryMarkers(bracket) : new Map<string, TournamentEntryMarker>(),
    [bracket],
  );
  const loserSourcesByMatchId = useMemo(() => {
    if (bracket?.id !== "awc2026") return new Map<string, LoserSource[]>();

    const losersRoundOneIds = new Set(
      bracket.matches
        .filter((match) => match.bracket === "losers" && match.round === "Round 1")
        .map((match) => match.id),
    );
    const sources = new Map<string, LoserSource[]>();

    bracket.matches
      .filter((match) => match.bracket === "main" && losersRoundOneIds.has(match.loser_to))
      .sort((left, right) => left.order - right.order)
      .forEach((match) => {
        const existing = sources.get(match.loser_to) || [];
        const hasNamedMatchup =
          !isEmptyPlayer(match.p1) &&
          !isEmptyPlayer(match.p2) &&
          !isTournamentByePlayer(match.p1) &&
          !isTournamentByePlayer(match.p2);
        existing.push({
          label: hasNamedMatchup
            ? `Loser: ${match.p1} vs ${match.p2}`
            : `Loser of ${getRoundShortLabel(match.round)} #${match.order}`,
          loserName: loserName(match),
        });
        sources.set(match.loser_to, existing);
      });

    return sources;
  }, [bracket]);
  const seedEntries = useMemo<TournamentSeedEntry[]>(() => {
    if (!bracket) return [];

    const displayNamesByUsername = new Map<string, string>();
    bracket.matches.forEach((match) => {
      [match.p1, match.p2].forEach((playerName) => {
        if (isEmptyPlayer(playerName) || isTournamentByePlayer(playerName)) return;
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
        eliminationStatus: getSeedEliminationStatus(bracket, playerName),
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

    void navigate({
      to: "/tournaments/$tournamentId/$tournamentTab",
      params: {
        tournamentId: getTournamentRouteId(bracket.id),
        tournamentTab: stageKey,
      },
    });

    // The view-state effect cleans up after the tab change; persist afterward so its
    // previous active key cannot overwrite the new selection.
    window.setTimeout(() => {
      const savedView = readSavedTournamentView(bracket.id) || {};
      setBrowserStorageItem(
        "session",
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
                  to="/tournaments/$tournamentId/$tournamentTab"
                  params={{
                    tournamentId: getTournamentRouteId(adjacentTournaments.previous.id),
                    tournamentTab: activeStageKey,
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
                  to="/tournaments/$tournamentId/$tournamentTab"
                  params={{
                    tournamentId: getTournamentRouteId(adjacentTournaments.next.id),
                    tournamentTab: activeStageKey,
                  }}
                >
                  {adjacentTournaments.next.year} →
                </Link>
              ) : (
                <span className="tournamentYearNavSpacer" aria-hidden="true" />
              )}
            </div>
          </div>
          <h1>{heading}</h1>
          {bracket.startDate || bracket.timeControl ? (
            <div className="tournamentHeroDetails">
              {bracket.startDate ? (
                <span className="tournamentStartDate">
                  {formatCalendarDateRange(bracket.startDate, bracket.endDate)}
                </span>
              ) : null}
              {bracket.timeControl ? (
                <span className="tournamentTimeControl timeControlValue">
                  {bracket.matchMode ? `${modeLabels[bracket.matchMode]} ` : null}
                  {formatTimeControl(bracket.timeControl)}
                </span>
              ) : null}
            </div>
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
        <CommunityCommentsLink
          target={{ type: "tournament", id: bracket.id }}
          className="tournamentCommentsLink"
          href="#tournament-comments"
          onClick={scrollToComments}
        />
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
              entryMarkers={entryMarkers}
              seedCount={topSeedMap.size}
              countryMap={countryMap}
              trophyAssetPath={bracket.trophyAssetPath}
              decisiveMatchId={decisiveMatchId}
              hideStartRoundControls={Boolean(bracket.hideStartRoundControls)}
              shouldSuppressMatchClick={shouldSuppressMatchClick}
              onStartRoundChange={(roundName) => setStageStartRound(stage.key, roundName)}
              setHeaderTrackRef={setHeaderTrackRef}
              setScrollerRef={setScrollerRef}
              onScrollerScroll={handleScrollerScroll}
              onPointerDown={handleScrollerPointerDown}
              onPointerMove={handleScrollerPointerMove}
              onPointerEnd={endScrollerDrag}
              loserSourcesByMatchId={loserSourcesByMatchId}
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

export const TournamentPage = ({
  tournamentId,
  tournamentTab,
}: {
  tournamentId: string;
  tournamentTab?: string | undefined;
}) => {
  if (tournamentId === "wolfarena2026" || tournamentId === "wr-arena2026") {
    return <WolfarenaTournamentPage />;
  }
  if (tournamentId === "acl-s1") {
    return <AtomicChessLeaguePage key="acl-s1" seasonNumber={1} />;
  }
  if (tournamentId === "acl-s2" || tournamentId === "atomicchessleague" || tournamentId === "acl") {
    return <AtomicChessLeaguePage key="acl-s2" seasonNumber={2} />;
  }
  return <BracketTournamentPage tournamentId={tournamentId} tournamentTab={tournamentTab} />;
};
