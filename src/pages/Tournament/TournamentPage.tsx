import "./TournamentPage.css";

import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { CommunityCommentsLink } from "../../components/CommunityCommentsLink/CommunityCommentsLink";
import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { TournamentPlayerLink } from "../../components/TournamentPlayerLink/TournamentPlayerLink";
import { modeLabels } from "../../constants/matches";
import { TournamentFairPlayFlag } from "../../features/tournaments/TournamentFairPlayFlag";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useUnderscoreUsernameCutoff } from "../../hooks/useUnderscoreUsernameCutoff";
import {
  formatMatchKickoff,
  getMatchKickoff,
  hasTournamentMatchResult,
} from "../../lib/matches/matchSchedule";
import {
  AWC_BRACKET_REFRESH_MS,
  tournamentBracketQueryOptions,
  tournamentCatalogQueryOptions,
} from "../../lib/matches/tournamentQueries";
import {
  compareTournamentStartDates,
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
import {
  formatCalendarDate,
  formatCalendarDateRange,
  formatTimeControl,
} from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { AtomicChessLeaguePage } from "./AtomicChessLeaguePage";
import {
  buildLoserSourcesByMatchId,
  buildStageTreeLayout,
  buildStartRoundState,
  buildZoomState,
  CARD_WIDTH,
  clampZoom,
  DEFAULT_STAGE_ZOOM,
  getAwcCurrentRound,
  getRoundSlug,
  getStageRoundShortLabel,
  getStageStartRound,
  getStageTrophyMatchId,
  getStartRoundOptions,
  getTournamentViewStorageKey,
  isRoundRobinQualifyingStage,
  type LoserSource,
  MAX_STAGE_ZOOM,
  MIN_STAGE_ZOOM,
  type PositionedMatch,
  readSavedTournamentView,
  SEEDS_STAGE_KEY,
  type StageLayout,
  stepStageZoom,
  zoomDisplayPercent,
} from "./bracketLayout";
import { buildRoundRobinGroups, type GroupStageHistoryEntry } from "./groupStage";
import { TournamentBracketViewport } from "./TournamentBracketViewport";
import { useTournamentBracketViewport } from "./useTournamentBracketViewport";
import { WolfarenaTournamentPage } from "./WolfarenaTournamentPage";

const TOURNAMENT_TAB_KEYS = new Set(["main", "losers", "qualifying", SEEDS_STAGE_KEY]);
const SCHEDULE_DISPLAY_GRACE_MS = 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;

const useMatchSchedule = (match: TournamentMatch) => {
  const [now, setNow] = useState(Date.now);
  const kickoff = hasTournamentMatchResult(match) ? null : getMatchKickoff(match);
  const expiresAt = kickoff === null ? null : kickoff + SCHEDULE_DISPLAY_GRACE_MS;
  const showStartTime = expiresAt !== null && now < expiresAt;

  useEffect(() => {
    if (expiresAt === null || now >= expiresAt) return;
    const delay = Math.max(0, Math.min(expiresAt - Date.now(), MAX_TIMEOUT_MS));
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, now]);

  return {
    hasSchedule: kickoff !== null,
    startTime: kickoff !== null && showStartTime ? formatMatchKickoff(kickoff) : "",
  };
};

const normalizeTournamentTab = (value: string | undefined): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return TOURNAMENT_TAB_KEYS.has(normalized) ? normalized : "";
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

  if (bracket.seriesKey !== "a960e") {
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
  }

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
            <TournamentPlayerLink className="tournamentSeedsPlayerLink" username={playerName}>
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
  showMatchDates,
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
  showMatchDates: boolean;
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
  const { hasSchedule, startTime } = useMatchSchedule(match);
  const matchDate = startTime || (showMatchDates ? formatCalendarDate(match.played_on) : "");
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
      className={`tournamentMatchCard tournamentMatchCardTree${hasMatchPage || hasSchedule ? " isClickable" : ""}${shouldShowTrophy ? " hasTrophy" : ""}${shouldShowTrophy && placeTrophyOnSide ? " hasSideTrophy" : ""}${match.replacement_for ? " hasReplacementHistory" : ""}${matchDate ? " hasMatchDate" : ""}`}
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
            to="/match/$matchId"
            params={{ matchId: match.match_id }}
            aria-label={openMatchLabel}
            onClick={handleOpenMatchClick}
          ></Link>
        )
      ) : hasSchedule ? (
        <Link
          className="tournamentMatchCardOpenLink"
          to="/match/scheduled/$tournamentId/$fixtureId"
          params={{ tournamentId: getTournamentRouteId(match.tournament), fixtureId: match.id }}
          aria-label={openMatchLabel}
          onClick={handleOpenMatchClick}
        ></Link>
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
        {matchDate ? (
          <time
            className="tournamentMatchDate"
            dateTime={startTime ? match.scheduled_at : match.played_on || undefined}
          >
            {matchDate}
          </time>
        ) : null}
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
      disabled={zoomLevel <= MIN_STAGE_ZOOM}
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
      disabled={zoomLevel >= MAX_STAGE_ZOOM}
    >
      +
    </button>
  </div>
);

const GroupHistoryChip = ({ entry }: { entry: GroupStageHistoryEntry }) => {
  const description = `${entry.roundName}: ${
    entry.result === "W" ? "win" : entry.result === "L" ? "loss" : "tie"
  } against ${entry.opponent}`;
  const className = `tournamentGroupHistoryChip is${entry.result}`;

  if (!entry.match.match_id) {
    return (
      <span className={className} title={description} aria-label={description}>
        {entry.result}
      </span>
    );
  }

  if (isExternalMatchUrl(entry.match.match_id)) {
    return (
      <a
        className={className}
        href={entry.match.match_id}
        title={description}
        aria-label={description}
      >
        {entry.result}
      </a>
    );
  }

  return (
    <Link
      className={className}
      to="/match/$matchId"
      params={{ matchId: entry.match.match_id }}
      title={description}
      aria-label={description}
    >
      {entry.result}
    </Link>
  );
};

const TournamentStageSection = ({
  stage,
  showMatchDates,
  layout,
  zoomLevel,
  startRoundName,
  automaticStartRoundName,
  topSeedMap,
  entryMarkers,
  seedCount,
  countryMap,
  trophyAssetPath,
  decisiveMatchId,
  hideStartRoundControls,
  shouldSuppressMatchClick,
  onStartRoundChange,
  viewport,
  loserSourcesByMatchId,
}: {
  stage: TournamentBracketStage;
  showMatchDates: boolean;
  layout: StageLayout;
  zoomLevel: number;
  startRoundName: string;
  automaticStartRoundName: string | undefined;
  topSeedMap: Map<string, number>;
  entryMarkers: Map<string, TournamentEntryMarker>;
  seedCount: number;
  countryMap: Map<string, string>;
  trophyAssetPath: string | undefined;
  decisiveMatchId: string;
  hideStartRoundControls?: boolean;
  shouldSuppressMatchClick: () => boolean;
  onStartRoundChange: (roundName: string) => void;
  viewport: ReturnType<typeof useTournamentBracketViewport>;
  loserSourcesByMatchId: Map<string, LoserSource[]>;
}) => {
  const [groupViews, setGroupViews] = useState<Record<string, "standings" | "matches">>({});
  const startRoundOptions = getStartRoundOptions(stage, automaticStartRoundName, startRoundName);
  const trophyMatchId = trophyAssetPath ? getStageTrophyMatchId(stage, decisiveMatchId) : "";
  const roundRobinGroups = isRoundRobinQualifyingStage(stage) ? buildRoundRobinGroups(stage) : null;

  return (
    <section className="tournamentStageSection" aria-labelledby={`${stage.key}-heading`}>
      <div className="tournamentStageHeader">
        <h2 id={`${stage.key}-heading`}>{stage.label}</h2>
      </div>
      {!roundRobinGroups && !hideStartRoundControls && startRoundOptions.length > 1 ? (
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
      {roundRobinGroups ? (
        <div className="tournamentGroupStageGrid" aria-label={stage.label}>
          {roundRobinGroups.map((group) => {
            const view = groupViews[group.name] ?? "standings";
            return (
              <section className="tournamentGroupStageCard" key={group.name}>
                <header className="tournamentGroupStageCardHeader">
                  <h3>Group {group.name}</h3>
                  <div
                    className="tournamentGroupStageTabs"
                    role="tablist"
                    aria-label={`Group ${group.name} view`}
                  >
                    {(["standings", "matches"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={view === tab}
                        className={view === tab ? "isActive" : ""}
                        onClick={() =>
                          setGroupViews((current) => ({ ...current, [group.name]: tab }))
                        }
                      >
                        {tab === "standings" ? "Standings" : "Matches"}
                      </button>
                    ))}
                  </div>
                </header>

                {view === "standings" ? (
                  <div className="tournamentGroupStandingsWrap">
                    <table className="tournamentGroupStandings">
                      <thead>
                        <tr>
                          <th scope="col">Rank</th>
                          <th scope="col">Player</th>
                          <th scope="col">W-L-T</th>
                          <th scope="col">History</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.standings.map((standing, index) => (
                          <tr key={standing.playerName}>
                            <td>{index + 1}</td>
                            <th scope="row">
                              <PlayerLabel
                                playerName={standing.playerName}
                                seed={topSeedMap.get(standing.playerName)}
                                seedCount={seedCount}
                                entryMarker={undefined}
                                isWinner={false}
                                countryCode={countryMap.get(standing.playerName)}
                                shouldSuppressClick={shouldSuppressMatchClick}
                              />
                            </th>
                            <td className="tournamentGroupRecord">
                              {standing.wins}-{standing.losses}-{standing.ties}
                            </td>
                            <td>
                              <span className="tournamentGroupHistory">
                                {standing.history.length ? (
                                  standing.history.map((entry) => (
                                    <GroupHistoryChip
                                      key={`${entry.match.id}-${standing.playerName}`}
                                      entry={entry}
                                    />
                                  ))
                                ) : (
                                  <span className="tournamentGroupHistoryEmpty">—</span>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="tournamentGroupRounds">
                    {group.rounds.map((round, roundIndex) => (
                      <section className="tournamentGroupRound" key={round.roundName}>
                        <h4>Round {roundIndex + 1}</h4>
                        <div className="tournamentGroupRoundMatches">
                          {round.matches.map((match) => (
                            <div className="tournamentGroupRoundMatch" key={match.id}>
                              <TournamentMatchCard
                                match={{ ...match, x: 0, y: 0 }}
                                showMatchDates={showMatchDates}
                                topSeedMap={topSeedMap}
                                entryMarkers={entryMarkers}
                                seedCount={seedCount}
                                countryMap={countryMap}
                                trophyAssetPath={undefined}
                                showTrophy={false}
                                placeTrophyOnSide={false}
                                shouldSuppressClick={shouldSuppressMatchClick}
                                loserSources={[]}
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <TournamentBracketViewport
          stage={stage}
          layout={layout}
          zoomLevel={zoomLevel}
          startRoundName={startRoundName}
          viewport={viewport}
        >
          {layout?.positionedMatches.map((match) => (
            <TournamentMatchCard
              key={match.id}
              match={match}
              showMatchDates={showMatchDates}
              topSeedMap={topSeedMap}
              entryMarkers={entryMarkers}
              seedCount={seedCount}
              countryMap={countryMap}
              trophyAssetPath={trophyAssetPath}
              showTrophy={match.id === trophyMatchId}
              placeTrophyOnSide={startRoundName === "Semifinals" || startRoundName === "Finals"}
              shouldSuppressClick={shouldSuppressMatchClick}
              loserSources={loserSourcesByMatchId.get(match.id) ?? []}
            />
          ))}
        </TournamentBracketViewport>
      )}
    </section>
  );
};

const BracketTournamentPage = ({
  tournamentId,
  tournamentTab,
  tournamentRound,
}: {
  tournamentId: string;
  tournamentTab?: string | undefined;
  tournamentRound?: string | undefined;
}) => {
  const navigate = useNavigate();
  const [showMatchDates, setShowMatchDates] = usePersistedState(
    "atomic-puzzles.tournaments.show-match-dates",
    z.boolean(),
    false,
  );
  const catalogQuery = useQuery(tournamentCatalogQueryOptions());
  const bracketQuery = useQuery({
    ...tournamentBracketQueryOptions(tournamentId),
    enabled: Boolean(tournamentId),
    refetchInterval: tournamentId === "awc2026" ? AWC_BRACKET_REFRESH_MS : false,
  });
  const bracket: TournamentBracket | null = bracketQuery.data ?? null;
  const bracketLoading = bracketQuery.isPending;
  const bracketError =
    !bracket && bracketQuery.error
      ? getErrorMessage(bracketQuery.error, "Unable to load tournament")
      : "";
  const [zoomLevels, setZoomLevels] = useState<Record<string, number>>({});
  const [activeStageKey, setActiveStageKey] = useState<string>("main");
  const viewport = useTournamentBracketViewport();
  const { scrollerRefs, syncRoundHeaderTrack } = viewport;
  const restoredViewKeyRef = useRef<string | null>(null);
  const previousStartRoundsRef = useRef<Record<string, string>>({});
  const pendingRestoreRef = useRef<{
    scrollPositions: Record<string, { left?: number; top?: number }>;
    pageScrollY: number;
  } | null>(null);

  const automaticStartRounds = useMemo<Record<string, string>>(
    () =>
      bracket?.id === "awc2026"
        ? Object.fromEntries(
            bracket.stages
              .filter((stage) => stage.key === "main" || stage.key === "losers")
              .map((stage) => [stage.key, getAwcCurrentRound(stage)]),
          )
        : {},
    [bracket],
  );
  const displayedStartRounds = useMemo(() => {
    const rounds = {
      ...buildStartRoundState(bracket?.stages, bracket?.defaultMainBracketStartRound),
      ...automaticStartRounds,
    };
    if (tournamentRound && bracket) {
      const stage =
        bracket.stages.find((entry) => entry.key === normalizeTournamentTab(tournamentTab)) ??
        (!tournamentTab
          ? (bracket.stages.find((entry) => entry.key === "main") ?? bracket.stages[0])
          : undefined);
      const round = stage?.rounds.find(
        (entry) => getRoundSlug(entry.roundName) === tournamentRound,
      );
      if (stage && round) rounds[stage.key] = round.roundName;
    }
    return rounds;
  }, [automaticStartRounds, bracket, tournamentRound, tournamentTab]);

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
        startRounds: displayedStartRounds,
        zoomLevels,
        activeStageKey,
        scrollPositions,
        pageScrollY: window.scrollY || 0,
      }),
    );
  }, [activeStageKey, bracket, displayedStartRounds, scrollerRefs, zoomLevels]);

  useEffect(() => {
    if (!bracket) return;

    const viewKey = `${bracket.id}:${tournamentTab ?? ""}`;
    if (restoredViewKeyRef.current === viewKey) return;
    restoredViewKeyRef.current = viewKey;

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
        : !tournamentRound && savedActiveStageKey && availableStageKeys.has(savedActiveStageKey)
          ? savedActiveStageKey
          : defaultActiveStageKey;

    setZoomLevels(buildZoomState(bracket.stages || [], savedView?.zoomLevels || {}));
    setActiveStageKey(nextActiveStageKey);
    pendingRestoreRef.current = savedView
      ? {
          scrollPositions: Object.fromEntries(
            Object.entries(savedView.scrollPositions || {}).filter(
              ([key]) => savedView.startRounds?.[key] === displayedStartRounds[key],
            ),
          ),
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
        search: { round: tournamentRound },
        hash: true,
        replace: true,
      });
    }
  }, [bracket, displayedStartRounds, navigate, tournamentRound, tournamentTab]);

  useEffect(() => {
    const previousRounds = previousStartRoundsRef.current;
    previousStartRoundsRef.current = displayedStartRounds;
    for (const [key, round] of Object.entries(displayedStartRounds)) {
      if (!previousRounds[key] || previousRounds[key] === round) continue;
      const scroller = scrollerRefs.current[key];
      if (!scroller) continue;
      scroller.scrollTo({ left: 0, top: 0, behavior: "auto" });
      syncRoundHeaderTrack(key, 0);
    }
  }, [displayedStartRounds, scrollerRefs, syncRoundHeaderTrack]);

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
  }, [bracket, displayedStartRounds, scrollerRefs, syncRoundHeaderTrack, zoomLevels]);

  useEffect(() => {
    if (!bracket || typeof window === "undefined") return undefined;

    window.addEventListener("pagehide", saveViewState);
    return () => {
      window.removeEventListener("pagehide", saveViewState);
      saveViewState();
    };
  }, [bracket, saveViewState]);

  const stageLayouts = useMemo(() => {
    if (!bracket) return new Map();

    return new Map(
      bracket.stages.map((stage) => [
        stage.key,
        buildStageTreeLayout(stage, getStageStartRound(stage, displayedStartRounds)),
      ]),
    );
  }, [bracket, displayedStartRounds]);

  const topSeedMap = useMemo(() => new Map(Object.entries(bracket?.seedMap || {})), [bracket]);
  const countryMap = useMemo(() => new Map(Object.entries(bracket?.countryMap || {})), [bracket]);
  const entryMarkers = useMemo(
    () =>
      bracket ? buildTournamentEntryMarkers(bracket) : new Map<string, TournamentEntryMarker>(),
    [bracket],
  );
  const loserSourcesByMatchId = useMemo(() => {
    if (bracket?.id !== "awc2026") return new Map<string, LoserSource[]>();

    return buildLoserSourcesByMatchId(bracket.matches);
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

  const updateStageZoom = (stageKey: string, direction: -1 | 1): void => {
    setZoomLevels((current) => ({
      ...current,
      [stageKey]: stepStageZoom(current[stageKey] ?? DEFAULT_STAGE_ZOOM, direction),
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
      search: {},
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
    if (!bracket) return;

    void navigate({
      to: "/tournaments/$tournamentId/$tournamentTab",
      params: {
        tournamentId: getTournamentRouteId(bracket.id),
        tournamentTab: stageKey,
      },
      search: { round: getRoundSlug(roundName) },
      resetScroll: false,
    });
  };

  const scrollToComments = (event: ReactMouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const commentsSection = document.getElementById("tournament-comments");
    if (!commentsSection) return;

    event.preventDefault();
    void navigate({
      search: true,
      hash: "tournament-comments",
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
    });
    commentsSection.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
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
  const tournamentYears = (catalogQuery.data ?? [bracket])
    .filter((entry) => entry.seriesKey === bracket.seriesKey)
    .sort(compareTournamentStartDates);

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
            <select
              className="tournamentYearSelect"
              aria-label="Tournament year"
              value={bracket.id}
              onChange={(event) => {
                void navigate({
                  to: "/tournaments/$tournamentId/$tournamentTab",
                  params: {
                    tournamentId: getTournamentRouteId(event.target.value),
                    tournamentTab: activeStageKey,
                  },
                });
              }}
            >
              {tournamentYears.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.year}
                </option>
              ))}
            </select>
          </div>
          <h1>{heading}</h1>
          {bracket.startDate || bracket.timeControl || bracket.hostNames?.length ? (
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
              {bracket.hostNames?.length ? (
                <span className="tournamentHosts">Hosted by {bracket.hostNames.join(" · ")}</span>
              ) : null}
              {bracket.id === "awc2026" ? (
                <Link className="tournamentBettingLink" to="/betting">
                  Betting
                </Link>
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
        <div className="tournamentBracketControls">
          {activeStage && !isRoundRobinQualifyingStage(activeStage) ? (
            <TournamentZoomControls
              stageLabel={activeStage.label}
              zoomLevel={clampZoom(zoomLevels[activeStage.key] || DEFAULT_STAGE_ZOOM)}
              onZoomOut={() => updateStageZoom(activeStage.key, -1)}
              onZoomReset={() => resetStageZoom(activeStage.key)}
              onZoomIn={() => updateStageZoom(activeStage.key, 1)}
            />
          ) : null}
          <div className="tournamentBracketOptions">
            {activeStage ? (
              <label className="tournamentDateSetting">
                <input
                  type="checkbox"
                  checked={showMatchDates}
                  onChange={(event) => setShowMatchDates(event.target.checked)}
                />
                Show dates
              </label>
            ) : null}
            <CommunityCommentsLink
              target={{ type: "tournament", id: bracket.id }}
              className="tournamentCommentsLink"
              href="#tournament-comments"
              onClick={scrollToComments}
            />
          </div>
        </div>
      </div>

      <div className="tournamentStages">
        {visibleStages.map((stage) => {
          const zoomLevel = clampZoom(zoomLevels[stage.key] || DEFAULT_STAGE_ZOOM);
          const startRoundName = getStageStartRound(stage, displayedStartRounds);

          return (
            <TournamentStageSection
              key={stage.key}
              stage={stage}
              showMatchDates={showMatchDates}
              layout={stageLayouts.get(stage.key)}
              zoomLevel={zoomLevel}
              startRoundName={startRoundName}
              automaticStartRoundName={automaticStartRounds[stage.key]}
              topSeedMap={topSeedMap}
              entryMarkers={entryMarkers}
              seedCount={topSeedMap.size}
              countryMap={countryMap}
              trophyAssetPath={bracket.trophyAssetPath}
              decisiveMatchId={decisiveMatchId}
              hideStartRoundControls={Boolean(bracket.hideStartRoundControls)}
              shouldSuppressMatchClick={viewport.shouldSuppressMatchClick}
              onStartRoundChange={(roundName) => setStageStartRound(stage.key, roundName)}
              viewport={viewport}
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
  tournamentRound,
}: {
  tournamentId: string;
  tournamentTab?: string | undefined;
  tournamentRound?: string | undefined;
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
  return (
    <BracketTournamentPage
      key={tournamentId === "awc2026" ? tournamentId : undefined}
      tournamentId={tournamentId}
      tournamentTab={tournamentTab}
      tournamentRound={tournamentRound}
    />
  );
};
