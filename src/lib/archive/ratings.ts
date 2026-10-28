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

export type PlayerDirectoryRow = {
  username: string;
  hyperbullet_rating: number | null;
  hyperbullet_peak: number | null;
  hyperbullet_rd: number | null;
  bullet_rating: number | null;
  bullet_peak: number | null;
  bullet_rd: number | null;
  blitz_rating: number | null;
  blitz_peak: number | null;
  blitz_rd: number | null;
};

const playerRatingsCache = new Map<string, Promise<PlayerRatingRow[]>>();
let playerDirectoryRequest: Promise<PlayerDirectoryRow[]> | null = null;

export const fetchPlayerDirectoryRows = (): Promise<PlayerDirectoryRow[]> => {
  playerDirectoryRequest ??= fetchArchiveJson<PlayerDirectoryRow[]>(
    new URLSearchParams({ resource: "player_directory" }),
  );
  return playerDirectoryRequest;
};

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
