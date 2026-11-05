import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { lichessIcons } from "../../components/PlayerHoverCard/lichessIcons";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { modeLabels } from "../../constants/matches";
import type { ArchiveGame } from "../../lib/archive/games";
import { decodeGameResult } from "../../lib/archive/games";
import { gameTerminationLabel } from "../../lib/games/termination";
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
    <div className={`gameBoardClockRow${active ? " active" : ""}`}>
      <time
        className="gameAnalysisClock"
        aria-label={`${username} clock, ${active ? "to move" : "waiting"}`}
      >
        {formatClock(clock)}
      </time>
    </div>
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
