import type { ArchiveGame } from "../archive/games";

const initialClockMilliseconds = (timeControl: string): number | null => {
  const minutes = Number(timeControl.split("+")[0]);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes * 60_000 : null;
};

const incrementMilliseconds = (timeControl: string): number => {
  const seconds = Number(timeControl.split("+")[1] ?? 0);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 0;
};

const clockDurations = (game: ArchiveGame, plyCount: number): Array<number | null> => {
  const initial = initialClockMilliseconds(game.time_control);
  if (initial === null) return Array.from({ length: plyCount }, () => null);
  const increment = incrementMilliseconds(game.time_control);
  const previous = [initial, initial];

  return Array.from({ length: plyCount }, (_, ply) => {
    const clock = game.clocks?.[ply];
    if (clock === undefined) return null;
    const side = ply % 2;
    const duration = Math.max(0, (previous[side] ?? initial) + increment - clock);
    previous[side] = clock;
    return duration;
  });
};

export const moveDurationsMilliseconds = (game: ArchiveGame): Array<number | null> => {
  const plyCount = Math.max(
    game.moves?.length ?? 0,
    game.clocks?.length ?? 0,
    game.move_ts?.length ?? 0,
  );
  if (!plyCount) return [];

  const fromClocks = clockDurations(game, plyCount);
  return Array.from({ length: plyCount }, (_, ply) => {
    const currentTimestamp = game.move_ts?.[ply];
    const previousTimestamp = ply > 0 ? game.move_ts?.[ply - 1] : undefined;
    if (
      ply > 0 &&
      currentTimestamp !== undefined &&
      previousTimestamp !== undefined &&
      currentTimestamp >= previousTimestamp
    ) {
      return currentTimestamp - previousTimestamp;
    }

    const clockDuration = fromClocks[ply];
    if (clockDuration !== null && clockDuration !== undefined) return clockDuration;

    if (
      ply === 0 &&
      game.game_index === 0 &&
      currentTimestamp !== undefined &&
      currentTimestamp >= game.start_ts
    ) {
      return currentTimestamp - game.start_ts;
    }

    return null;
  });
};
