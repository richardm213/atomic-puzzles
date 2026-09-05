import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { appendArchiveParam, fetchArchiveJson } from "./client";
import type { PlayerRatingRow } from "./types";

export type { PlayerRatingRow } from "./types";

type PlayerRatingFilters = {
  tc?: string;
  username?: string;
  limit?: number;
};

const playerRatingsCache = new Map<string, Promise<PlayerRatingRow[]>>();

const fetchUncachedPlayerRatingsRows = async (
  filters: PlayerRatingFilters = {},
): Promise<PlayerRatingRow[]> => {
  const { tc, username, limit } = filters;
  const normalizedUsername = normalizeUsername(username);
  const params = new URLSearchParams({ resource: "ratings" });
  appendArchiveParam(params, "mode", tc);
  appendArchiveParam(params, "username", normalizedUsername);
  appendArchiveParam(params, "limit", Number(limit) > 0 ? Math.floor(Number(limit)) : null);
  return fetchArchiveJson<PlayerRatingRow[]>(params);
};

export const fetchPlayerRatingsRows = async (
  filters: PlayerRatingFilters = {},
): Promise<PlayerRatingRow[]> =>
  cachedRequest(playerRatingsCache, ["playerRatings", filters], () =>
    fetchUncachedPlayerRatingsRows(filters),
  );
