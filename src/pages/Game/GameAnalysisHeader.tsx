import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { BoardClock } from "../../components/BoardClock/BoardClock";
import { lichessIcons } from "../../components/PlayerHoverCard/lichessIcons";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { modeLabels } from "../../constants/matches";
import type { ArchiveGame } from "../../lib/archive/games";
import { decodeGameResult } from "../../lib/archive/games";
import { gameTerminationLabel } from "../../lib/games/termination";
import { loadRawMatchById } from "../../lib/matches/data";
import { getTournamentMatchLocation, getTournamentRouteId } from "../../lib/matches/tournaments";
import { formatLocalDateTime } from "../../utils/formatters";

const initialClock = (timeControl: string): number | null => {
  const minutes = Number(timeControl.split("+")[0]);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes * 60_000 : null;
};

const clockAtPly = (
  clocks: number[] | null,
  currentPly: number,
  side: 0 | 1,
  fallback: number | null,
): number | null => {
  if (!clocks || currentPly <= side) return fallback;
  const lastIndex = Math.min(currentPly - 1, clocks.length - 1);
  const index = lastIndex - ((lastIndex - side + 2) % 2);
  return index >= 0 ? (clocks[index] ?? null) : null;
};

const formatClock = (milliseconds: number | null): string => {
  if (milliseconds === null) return "—";
  const totalTenths = Math.max(0, Math.round(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}`
    : `00:${String(seconds).padStart(2, "0")}.${tenths}`;
};

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

export const GameBoardClock = ({
  game,
  currentPly,
  color,
}: {
  game: ArchiveGame;
  currentPly: number;
  color: "white" | "black";
}) => {
  const { white, black } = decodeGameResult(game);
  const startingClock = initialClock(game.time_control);
  const whiteClock = clockAtPly(game.clocks, currentPly, 0, startingClock);
  const blackClock = clockAtPly(game.clocks, currentPly, 1, startingClock);
  const username = color === "white" ? white : black;
  const clock = color === "white" ? whiteClock : blackClock;
  const active = (currentPly % 2 === 0 ? "white" : "black") === color;

  return (
    <BoardClock
      value={formatClock(clock)}
      ariaLabel={`${username} clock, ${active ? "to move" : "waiting"}`}
      active={active}
    />
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
        <span
          className="gameAnalysisModeIcon"
          aria-label={`${modeLabels[game.mode]} game`}
          title={modeLabels[game.mode]}
        >
          {gameModeIcons[game.mode]}
        </span>
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

export const GameMatchNavigation = ({ game }: { game: ArchiveGame }) => {
  const matchQuery = useQuery({
    queryKey: ["games", "match-crosstable", game.external_match_id],
    queryFn: () => loadRawMatchById(game.external_match_id),
    enabled: Boolean(game.external_match_id),
    staleTime: 10 * 60 * 1_000,
  });
  const games = matchQuery.data?.games ?? [];
  const currentIndex = games.findIndex((matchGame) => matchGame.id === game.game_id);
  if (games.length <= 1 || currentIndex < 0) return null;

  const previousGame = games[currentIndex - 1] ?? null;
  const nextGame = games[currentIndex + 1] ?? null;

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
            title={`Game ${currentIndex}`}
          >
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            className="gameAnalysisGameNavigationButton"
            aria-label="No previous game"
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
            title={`Game ${currentIndex + 2}`}
          >
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            className="gameAnalysisGameNavigationButton"
            aria-label="No next game"
            disabled
          >
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </button>
        )}
      </div>
    </nav>
  );
};
