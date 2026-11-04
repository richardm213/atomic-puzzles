import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { PLAYER_FLAIRS, type PlayerFlair } from "../../../shared/domain/playerSocial";
import { normalizeUsername } from "../../utils/playerNames";
import { apiRequest } from "../api/postApi";
import { getSupabaseClient } from "../supabase/client";

const playerSocialSchema = z.object({
  username: z.string(),
  flair: z.enum(PLAYER_FLAIRS).nullable(),
  countryCode: z.string(),
  tourRank: z.number().int().positive().nullable(),
  ratings: z.array(
    z.object({
      tc: z.string(),
      rating: z.number().nullable(),
      rd: z.number().nullable(),
    }),
  ),
  startDate: z.string().nullable(),
  totalGames: z.number().nonnegative(),
});

const mutationResponseSchema = z.object({ ok: z.boolean() }).passthrough();

export type PlayerSocial = z.infer<typeof playerSocialSchema>;

export const playerSocialQueryOptions = (username: string) => {
  const normalizedUsername = normalizeUsername(username);
  return queryOptions({
    queryKey: ["player-social", normalizedUsername],
    queryFn: () =>
      apiRequest(`/api/player-social?username=${encodeURIComponent(normalizedUsername)}`, {
        schema: playerSocialSchema,
        errorMessage: "Unable to load player details.",
        invalidMessage: "The player details response was invalid.",
      }),
    enabled: Boolean(normalizedUsername),
    staleTime: 5 * 60 * 1_000,
  });
};

export const playerFlairQueryOptions = (username: string) => {
  const normalizedUsername = normalizeUsername(username);
  return queryOptions({
    queryKey: ["player-flair", normalizedUsername],
    queryFn: () => loadPlayerFlair(normalizedUsername),
    enabled: Boolean(normalizedUsername),
    staleTime: 10 * 60 * 1_000,
  });
};

type FlairWaiter = {
  resolve: (flair: PlayerFlair | null) => void;
  reject: (error: Error) => void;
};

const pendingFlairs = new Map<string, FlairWaiter[]>();
let flairBatchTimer: ReturnType<typeof setTimeout> | null = null;
const FLAIR_BATCH_SIZE = 100;

const flushFlairBatch = async () => {
  flairBatchTimer = null;
  const batch = new Map(pendingFlairs);
  pendingFlairs.clear();
  const usernames = [...batch.keys()];
  if (!usernames.length) return;
  const chunks = Array.from(
    { length: Math.ceil(usernames.length / FLAIR_BATCH_SIZE) },
    (_, index) => usernames.slice(index * FLAIR_BATCH_SIZE, (index + 1) * FLAIR_BATCH_SIZE),
  );
  const results = await Promise.all(
    chunks.map((chunk) =>
      getSupabaseClient()
        .from("player_social_profiles")
        .select("username,flair")
        .in("username", chunk),
    ),
  );
  if (results.some(({ error }) => error)) {
    const failure = new Error("Unable to load player flairs.");
    batch.forEach((waiters) => waiters.forEach(({ reject }) => reject(failure)));
    return;
  }
  const flairs = new Map(
    results
      .flatMap(({ data }) => data ?? [])
      .map((row) => [String(row.username), String(row.flair ?? "")]),
  );
  batch.forEach((waiters, username) => {
    const value = flairs.get(username) ?? "";
    const flair = PLAYER_FLAIRS.includes(value as PlayerFlair) ? (value as PlayerFlair) : null;
    waiters.forEach(({ resolve }) => resolve(flair));
  });
};

const loadPlayerFlair = (username: string): Promise<PlayerFlair | null> =>
  new Promise((resolve, reject) => {
    pendingFlairs.set(username, [...(pendingFlairs.get(username) ?? []), { resolve, reject }]);
    flairBatchTimer ??= setTimeout(() => void flushFlairBatch(), 0);
  });

export const updatePlayerFlair = (flair: PlayerFlair | null) =>
  apiRequest("/api/player-social", {
    method: "POST",
    body: { action: "setFlair", flair },
    schema: mutationResponseSchema,
    errorMessage: "Unable to update flair.",
  });
