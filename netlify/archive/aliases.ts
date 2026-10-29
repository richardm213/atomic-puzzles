import { getArchiveClient } from "./client";

export const resolveCanonicalArchiveUsername = async (username: string): Promise<string> => {
  const exactUsername = username.trim();
  const normalizedUsername = exactUsername.toLowerCase();
  if (!exactUsername) return "";

  const result = await getArchiveClient().execute({
    sql: `select p.username, coalesce(a.count_games, 'y') as count_games from aliases a
      join players p on p.id=a.player_id
      where a.alias=? or (a.count_games<>'p' and lower(a.alias)=?)
      order by case when a.alias=? then 0 else 1 end limit 1`,
    args: [exactUsername, normalizedUsername, exactUsername],
  });

  const countGames = String(result.rows[0]?.count_games ?? "y")
    .trim()
    .toLowerCase();

  // `n` is a deliberately separate (usually drunk) Lichess account. `c` is a
  // Chess.com-only alias and must never capture a same-named Lichess login.
  if (countGames === "n" || countGames === "c" || countGames === "p") return normalizedUsername;

  return String(result.rows[0]?.username ?? normalizedUsername)
    .trim()
    .toLowerCase();
};
