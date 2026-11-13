import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { lichessIcons } from "../../components/PlayerHoverCard/lichessIcons";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { modeLabels } from "../../constants/matches";
import { useBoardItemShortcuts } from "../../hooks/useBoardItemShortcuts";
import type { ArchiveGame } from "../../lib/archive/games";
import { decodeGameResult } from "../../lib/archive/games";
import { gameTerminationLabel } from "../../lib/games/termination";
import { loadRawMatchById } from "../../lib/matches/data";
import { buildExternalGameUrl } from "../../lib/matches/routes";
import { getTournamentMatchLocation, getTournamentRouteId } from "../../lib/matches/tournaments";
import { formatLocalDateTime } from "../../utils/formatters";

const ratingForPlayer = (game: ArchiveGame, username: string) =>
  username === game.player_1
    ? { before: game.p1_before_rating, after: game.p1_after_rating, beforeRd: game.p1_before_rd }
    : { before: game.p2_before_rating, after: game.p2_after_rating, beforeRd: game.p2_before_rd };

const formatRating = (rating: number): string => String(Math.round(rating));

const formatRatingChange = (change: number): string => (change > 0 ? `+${change}` : String(change));

const gameModeIcons = {
  hyperbullet: lichessIcons.ultraBullet,
  bullet: lichessIcons.bullet,
  blitz: lichessIcons.blitz,
  rapid: lichessIcons.rapid,
  wolfrandom: lichessIcons.blitz,
  atomic960: lichessIcons.chess960,
} as const;

const PlayerRating = ({ game, username }: { game: ArchiveGame; username: string }) => {
  if (game.ratings_are_per_game !== true) return null;
  const { before, after, beforeRd } = ratingForPlayer(game, username);
  const change = before !== null && after !== null ? after - before : null;
  const roundedChange = change === null ? null : Math.round(change);
  const formattedChange = roundedChange === null ? null : formatRatingChange(roundedChange);

  if (before === null) return null;

  return (
    <span className="gameAnalysisRating">
      <span>{`${formatRating(before)}${(beforeRd ?? 0) >= 100 ? "?" : ""}`}</span>
      {roundedChange !== null && formattedChange !== null ? (
        <span
          className={`gameAnalysisRatingChange ${roundedChange > 0 ? "positive" : roundedChange < 0 ? "negative" : "neutral"}`}
          aria-label={`Rating change ${formattedChange}`}
        >
          {formattedChange}
        </span>
      ) : null}
    </span>
  );
};

export const GameAnalysisHeader = ({ game }: { game: ArchiveGame }) => {
  const { white, black } = decodeGameResult(game);
  const tournamentLocationQuery = useQuery({
    queryKey: ["tournament-match-location", game.external_match_id],
    queryFn: () => getTournamentMatchLocation(game.external_match_id),
    enabled: Boolean(game.external_match_id),
    staleTime: 10 * 60 * 1_000,
  });
  const tournamentLocation = tournamentLocationQuery.data ?? null;

  const player = (username: string, color: "white" | "black") => (
    <div className="gameAnalysisPlayer">
      <span className={`playerColorMarker ${color}`} aria-label={`${color} pieces`} />
      <PlayerLink username={username} className="gameAnalysisPlayerName">
        {username}
      </PlayerLink>
      <PlayerRating game={game} username={username} />
    </div>
  );

  return (
    <header className="gameAnalysisHeader">
      <div className="gameAnalysisMetaRow">
        <a
          className="gameAnalysisModeIcon"
          href={buildExternalGameUrl(game.game_id, { source: game.source })}
          target="_blank"
          rel="noreferrer"
          aria-label={`View original ${modeLabels[game.mode]} game`}
          title="View original game"
        >
          {gameModeIcons[game.mode]}
        </a>
        <div className="gameAnalysisMeta">
          <div className="gameAnalysisMetaPrimary">
            <span>{game.time_control}</span>
            <strong>{modeLabels[game.mode]}</strong>
          </div>
          {tournamentLocation ? (
            <Link
              className="gameAnalysisTournamentLink"
              to="/tournaments/$tournamentId"
              params={{
                tournamentId: getTournamentRouteId(tournamentLocation.tournament.id),
              }}
              title={`Open ${tournamentLocation.tournament.title}`}
            >
              {tournamentLocation.tournament.title} {tournamentLocation.roundLabel}
            </Link>
          ) : null}
          <span className="gameAnalysisDate">{formatLocalDateTime(game.start_ts)}</span>
        </div>
      </div>
      <div className="gameAnalysisPlayers">
        {player(white, "white")}
        {player(black, "black")}
      </div>
      <p className="gameAnalysisResult">{gameTerminationLabel(game)}</p>
    </header>
  );
};

export const GameMatchNavigation = ({
  game,
  puzzleDraftOpen = false,
}: {
  game: ArchiveGame;
  puzzleDraftOpen?: boolean;
}) => {
  const navigate = useNavigate();
  const matchQuery = useQuery({
    queryKey: ["games", "match-crosstable", game.external_match_id],
    queryFn: () => loadRawMatchById(game.external_match_id),
    enabled: Boolean(game.external_match_id),
    staleTime: 10 * 60 * 1_000,
  });
  const games = matchQuery.data?.games ?? [];
  const currentIndex = games.findIndex((matchGame) => matchGame.id === game.game_id);
  const previousGame = puzzleDraftOpen ? null : (games[currentIndex - 1] ?? null);
  const nextGame = !puzzleDraftOpen && currentIndex >= 0 ? (games[currentIndex + 1] ?? null) : null;
  const previousGameId = previousGame?.id;
  const nextGameId = nextGame?.id;

  const { previousHint, nextHint, previousAria, nextAria } = useBoardItemShortcuts({
    onPrevious: previousGameId
      ? () => {
          void navigate({ to: "/game/$gameId", params: { gameId: previousGameId } });
        }
      : undefined,
    onNext: nextGameId
      ? () => {
          void navigate({ to: "/game/$gameId", params: { gameId: nextGameId } });
        }
      : undefined,
  });

  if (games.length <= 1 || currentIndex < 0) return null;

  return (
    <nav className="gameAnalysisGameNavigation" aria-label="Games in this match">
      <span className="gameAnalysisGameNumber">
        Game {currentIndex + 1}/{games.length}
      </span>
      <div className="gameAnalysisGameNavigationButtons">
        {previousGame ? (
          <Link
            className="gameAnalysisGameNavigationButton"
            to="/game/$gameId"
            params={{ gameId: previousGame.id }}
            aria-label={`Previous game, game ${currentIndex}`}
            title={`Previous game, game ${currentIndex}${previousHint ? ` (${previousHint})` : ""}`}
            aria-keyshortcuts={previousAria}
          >
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            className="gameAnalysisGameNavigationButton"
            aria-label={
              puzzleDraftOpen
                ? "Previous game unavailable while creating a puzzle"
                : "No previous game"
            }
            title={
              puzzleDraftOpen
                ? "Finish creating the puzzle to switch games"
                : `No previous game${previousHint ? ` (${previousHint})` : ""}`
            }
            disabled
          >
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          </button>
        )}
        {nextGame ? (
          <Link
            className="gameAnalysisGameNavigationButton"
            to="/game/$gameId"
            params={{ gameId: nextGame.id }}
            aria-label={`Next game, game ${currentIndex + 2}`}
            title={`Next game, game ${currentIndex + 2}${nextHint ? ` (${nextHint})` : ""}`}
            aria-keyshortcuts={nextAria}
          >
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            className="gameAnalysisGameNavigationButton"
            aria-label={
              puzzleDraftOpen ? "Next game unavailable while creating a puzzle" : "No next game"
            }
            title={
              puzzleDraftOpen
                ? "Finish creating the puzzle to switch games"
                : `No next game${nextHint ? ` (${nextHint})` : ""}`
            }
            disabled
          >
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </button>
        )}
      </div>
    </nav>
  );
};
