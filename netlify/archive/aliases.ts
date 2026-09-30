import { getArchiveClient } from "./client";

export const resolveCanonicalArchiveUsername = async (username: string): Promise<string> => {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) return "";

  const result = await getArchiveClient().execute({
    sql: `select p.username from aliases a
      join players p on p.id=a.player_id where a.alias=? limit 1`,
    args: [normalizedUsername],
  });

  return String(result.rows[0]?.username ?? normalizedUsername)
    .trim()
    .toLowerCase();
};
