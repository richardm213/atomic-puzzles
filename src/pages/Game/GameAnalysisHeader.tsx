import { Link } from "@tanstack/react-router";

import type { ArchiveGame } from "../../lib/archive/games";
import { decodeGameResult } from "../../lib/archive/games";
import { formatLocalDateTime } from "../../utils/formatters";

const clockAtPly = (clocks: number[] | null, currentPly: number, side: 0 | 1): number | null => {
  if (!clocks || currentPly <= side) return null;
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

const ratingForPlayer = (game: ArchiveGame, username: string): number | null =>
  username === game.player_1 ? game.p1_before_rating : game.p2_before_rating;

export const GameAnalysisHeader = ({
  game,
  currentPly,
}: {
  game: ArchiveGame;
  currentPly: number;
}) => {
  const { white, black, winner } = decodeGameResult(game);
  const whiteClock = clockAtPly(game.clocks, currentPly, 0);
  const blackClock = clockAtPly(game.clocks, currentPly, 1);

  const player = (username: string, color: "white" | "black", clock: number | null) => (
    <div className={`gameAnalysisPlayer ${winner === color ? "winner" : ""}`}>
      <span className={`gameAnalysisColor ${color}`} aria-label={`${color} pieces`} />
      <Link to="/@/$username" params={{ username }} className="gameAnalysisPlayerName">
        {username}
      </Link>
      <span className="gameAnalysisRating">{ratingForPlayer(game, username) ?? "Unrated"}</span>
      <time className="gameAnalysisClock">{formatClock(clock)}</time>
    </div>
  );

  return (
    <header className="gameAnalysisHeader">
      {player(black, "black", blackClock)}
      {player(white, "white", whiteClock)}
      <div className="gameAnalysisMeta">
        <span>{game.time_control}</span>
        <span>{formatLocalDateTime(game.start_ts)}</span>
        {game.tournament ? <span>{game.tournament}</span> : null}
      </div>
    </header>
  );
};
