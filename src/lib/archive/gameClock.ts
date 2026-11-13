import { type ArchiveGame, decodeGameResult } from "./games";

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

export const gameClockAtPly = (game: ArchiveGame, currentPly: number, color: "white" | "black") => {
  const players = decodeGameResult(game);
  const side = color === "white" ? 0 : 1;
  const clock = clockAtPly(game.clocks, currentPly, side, initialClock(game.time_control));
  const active = currentPly % 2 === side;
  return {
    value: formatClock(clock),
    ariaLabel: `${players[color]} clock, ${active ? "to move" : "waiting"}`,
    active,
  };
};
