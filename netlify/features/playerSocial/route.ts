import { z } from "zod";

import { PLAYER_FLAIRS, type StoredPlayerRating } from "../../../shared/domain/playerSocial";
import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../platform/authentication";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { HttpError } from "../../platform/errors";
import { jsonResponse } from "../../platform/response";
import { parseJsonBody } from "../../platform/validation";

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_-]+$/i);
const flairSchema = z.enum(PLAYER_FLAIRS);
const countryCodeSchema = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{2}$/.test(value), "Country code must use two letters.");
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setFlair"), flair: flairSchema.nullable() }),
  z.object({ action: z.literal("setCountry"), countryCode: countryCodeSchema.nullable() }),
]);

const storedRatings = (value: unknown): StoredPlayerRating[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const candidate = row as Record<string, unknown>;
    const tc = String(candidate.tc ?? "");
    if (!tc) return [];
    const rating = candidate.rating === null ? null : Number(candidate.rating);
    const rd = candidate.rd === null ? null : Number(candidate.rd);
    return [
      {
        tc,
        rating: Number.isFinite(rating) ? rating : null,
        rd: Number.isFinite(rd) ? rd : null,
      },
    ];
  });
};

const getPlayerSocial = async (event: FunctionEvent) => {
  const parsedUsername = usernameSchema.safeParse(event.queryStringParameters?.username);
  if (!parsedUsername.success) throw new HttpError(400, "Valid username is required.");

  const username = parsedUsername.data.toLowerCase();
  const supabase = createServerSupabase("Player social service");
  const [profileResult, countryResult, tourResult] = await Promise.all([
    supabase
      .from("player_social_profiles")
      .select("flair,country_code,archive_start_date,total_games,ratings")
      .eq("username", username)
      .maybeSingle(),
    supabase
      .from("player_countries")
      .select("country_code")
      .ilike("player_name", username)
      .maybeSingle(),
    supabase
      .from("atomic_tour_ranking_snapshots")
      .select("rank")
      .eq("player_name", username)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profileResult.error || countryResult.error || tourResult.error) {
    throw new Error("Unable to load player social data.");
  }

  const profileCountryCode = String(profileResult.data?.country_code ?? "").toUpperCase();
  const tournamentCountryCode = String(countryResult.data?.country_code ?? "").toUpperCase();

  return jsonResponse(200, {
    username,
    flair: profileResult.data?.flair ?? null,
    countryCode: profileCountryCode || tournamentCountryCode,
    countryCodeSource: profileCountryCode ? "profile" : tournamentCountryCode ? "tournament" : null,
    tournamentCountryCode,
    tourRank: Number(tourResult.data?.rank) || null,
    ratings: storedRatings(profileResult.data?.ratings),
    startDate: profileResult.data?.archive_start_date ?? null,
    totalGames: Number(profileResult.data?.total_games) || 0,
  });
};

const mutatePlayerSocial = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site profile updates are not allowed.");
  const identity = await authenticateRequest(event.headers);
  const viewerUsername = requireUsername(identity, "Sign in to update player settings.")
    .trim()
    .toLowerCase();
  const input = parseJsonBody(event, mutationSchema, "Invalid player social request.");
  const supabase = createServerSupabase("Player social service");

  const profileUpdate =
    input.action === "setFlair" ? { flair: input.flair } : { country_code: input.countryCode };
  const { error } = await supabase.from("player_social_profiles").upsert(
    {
      username: viewerUsername,
      ...profileUpdate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "username" },
  );
  if (error) {
    throw new Error(
      input.action === "setFlair" ? "Unable to update flair." : "Unable to update country.",
    );
  }
  return identityResponse(identity, 200, { ok: true, ...profileUpdate });
};

export const playerSocialRoute = async (event: FunctionEvent) =>
  event.httpMethod === "GET" ? getPlayerSocial(event) : mutatePlayerSocial(event);
