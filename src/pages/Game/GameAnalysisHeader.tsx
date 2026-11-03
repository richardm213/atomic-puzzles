import { Link } from "@tanstack/react-router";

import type { ArchiveGame } from "../../lib/archive/games";
import { decodeGameResult } from "../../lib/archive/games";
import { gameTerminationLabel } from "../../lib/games/termination";
import { formatLocalDateTime, formatSignedDecimal } from "../../utils/formatters";

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
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}.${tenths}`;
};

const ratingForPlayer = (game: ArchiveGame, username: string) =>
  username === game.player_1
    ? { before: game.p1_before_rating, after: game.p1_after_rating }
    : { before: game.p2_before_rating, after: game.p2_after_rating };

const formatRating = (rating: number): string => String(Math.round(rating * 10) / 10);

const PlayerRating = ({ game, username }: { game: ArchiveGame; username: string }) => {
  const { before, after } = ratingForPlayer(game, username);
  const change = before !== null && after !== null ? after - before : null;

  if (before === null) return <span className="gameAnalysisRating">Unrated</span>;

  return (
    <span className="gameAnalysisRating">
      <span>{formatRating(before)}</span>
      {change !== null ? (
        <span
          className={`gameAnalysisRatingChange ${change > 0 ? "positive" : change < 0 ? "negative" : "neutral"}`}
          aria-label={`Rating change ${formatSignedDecimal(change)}`}
        >
          {formatSignedDecimal(change)}
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

  const player = (username: string, color: "white" | "black") => (
    <div className="gameAnalysisPlayer">
      <span className={`gameAnalysisColor ${color}`} aria-label={`${color} pieces`} />
      <Link to="/@/$username" params={{ username }} className="gameAnalysisPlayerName">
        {username}
      </Link>
      <PlayerRating game={game} username={username} />
    </div>
  );

  return (
    <header className="gameAnalysisHeader">
      {player(white, "white")}
      {player(black, "black")}
      <div className="gameAnalysisMeta">
        <strong>{game.mode}</strong>
        <span>{game.time_control}</span>
        <span>{formatLocalDateTime(game.start_ts)}</span>
        {game.tournament ? <span>{game.tournament}</span> : null}
      </div>
      <p className="gameAnalysisResult">{gameTerminationLabel(game)}</p>
    </header>
  );
};
