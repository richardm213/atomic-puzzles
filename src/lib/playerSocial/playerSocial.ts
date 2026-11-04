import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { PLAYER_FLAIRS, type PlayerFlair } from "../../../shared/domain/playerSocial";
import { normalizeUsername } from "../../utils/playerNames";
import { apiRequest } from "../api/postApi";

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

export const updatePlayerFlair = (flair: PlayerFlair | null) =>
  apiRequest("/api/player-social", {
    method: "POST",
    body: { action: "setFlair", flair },
    schema: mutationResponseSchema,
    errorMessage: "Unable to update flair.",
  });
