import { z } from "zod";

import { PLAYER_FLAIRS, type StoredPlayerRating } from "../../../shared/domain/playerSocial";
import { resolveCanonicalArchiveUsername } from "../../archive/aliases";
import { queryArchiveResource } from "../../archive/queries";
import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../platform/authentication";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { HttpError } from "../../platform/errors";
import { parseJsonBody } from "../../platform/validation";

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_-]+$/i);
const flairSchema = z.enum(PLAYER_FLAIRS);
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("follow"), username: usernameSchema }),
  z.object({ action: z.literal("unfollow"), username: usernameSchema }),
  z.object({ action: z.literal("setFlair"), flair: flairSchema.nullable() }),
]);

type ArchiveSummary = { start_ts: number | null; total_games: number };
const PROFILE_REFRESH_MS = 24 * 60 * 60 * 1_000;

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

const archiveDate = (timestamp: number | null): string | null => {
  if (timestamp === null || !Number.isFinite(timestamp)) return null;
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp;
  return new Date(milliseconds).toISOString().slice(0, 10);
};

const getPlayerSocial = async (event: FunctionEvent) => {
  const parsedUsername = usernameSchema.safeParse(event.queryStringParameters?.username);
  if (!parsedUsername.success) throw new HttpError(400, "Valid username is required.");

  const identity = await authenticateRequest(event.headers, true);
  const username = await resolveCanonicalArchiveUsername(parsedUsername.data);
  const viewerUsername = identity.username
    ? await resolveCanonicalArchiveUsername(identity.username)
    : null;
  const supabase = createServerSupabase("Player social service");
  const [profileResult, countryResult, tourResult, followerResult, followingResult] =
    await Promise.all([
      supabase
        .from("player_social_profiles")
        .select("flair,archive_start_date,total_games,ratings,ratings_snapshot_date,updated_at")
        .eq("username", username)
        .maybeSingle(),
      supabase
        .from("player_countries")
        .select("country_code")
        .eq("player_name", username)
        .maybeSingle(),
      supabase
        .from("atomic_tour_ranking_snapshots")
        .select("rank")
        .eq("player_name", username)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("player_follows")
        .select("followed_username", { count: "exact", head: true })
        .eq("followed_username", username),
      viewerUsername && viewerUsername !== username
        ? supabase
            .from("player_follows")
            .select("followed_username")
            .eq("follower_username", viewerUsername)
            .eq("followed_username", username)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (
    profileResult.error ||
    countryResult.error ||
    tourResult.error ||
    followerResult.error ||
    followingResult.error
  ) {
    throw new Error("Unable to load player social data.");
  }

  const updatedAt = new Date(String(profileResult.data?.updated_at ?? "")).getTime();
  const needsArchiveRefresh =
    !profileResult.data?.archive_start_date ||
    !Number.isFinite(updatedAt) ||
    Date.now() - updatedAt >= PROFILE_REFRESH_MS;
  let startDate = profileResult.data?.archive_start_date ?? null;
  let totalGames = Number(profileResult.data?.total_games) || 0;
  if (needsArchiveRefresh) {
    const archiveSummary = (await queryArchiveResource(
      new URLSearchParams({ resource: "player_summary", username }),
    )) as ArchiveSummary;
    startDate = archiveDate(archiveSummary.start_ts);
    totalGames = archiveSummary.total_games;
    const { error } = await supabase.from("player_social_profiles").upsert(
      {
        username,
        archive_start_date: startDate,
        total_games: totalGames,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "username" },
    );
    if (error) throw new Error("Unable to refresh player profile metadata.");
  }

  return identityResponse(identity, 200, {
    username,
    flair: profileResult.data?.flair ?? null,
    countryCode: String(countryResult.data?.country_code ?? "").toUpperCase(),
    tourRank: Number(tourResult.data?.rank) || null,
    ratings: storedRatings(profileResult.data?.ratings),
    startDate,
    totalGames,
    followerCount: followerResult.count ?? 0,
    isFollowing: Boolean(followingResult.data),
    isSelf: viewerUsername === username,
    canFollow: Boolean(viewerUsername && viewerUsername !== username),
  });
};

const mutatePlayerSocial = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site profile updates are not allowed.");
  const identity = await authenticateRequest(event.headers);
  const viewerUsername = await resolveCanonicalArchiveUsername(
    requireUsername(identity, "Sign in to update player settings."),
  );
  const input = parseJsonBody(event, mutationSchema, "Invalid player social request.");
  const supabase = createServerSupabase("Player social service");

  if (input.action === "setFlair") {
    const { error } = await supabase
      .from("player_social_profiles")
      .upsert(
        { username: viewerUsername, flair: input.flair, updated_at: new Date().toISOString() },
        { onConflict: "username" },
      );
    if (error) throw new Error("Unable to update flair.");
    return identityResponse(identity, 200, { ok: true, flair: input.flair });
  }

  const followedUsername = await resolveCanonicalArchiveUsername(input.username);
  if (followedUsername === viewerUsername) throw new HttpError(400, "You cannot follow yourself.");

  if (input.action === "follow") {
    const { error } = await supabase
      .from("player_follows")
      .upsert(
        { follower_username: viewerUsername, followed_username: followedUsername },
        { onConflict: "follower_username,followed_username" },
      );
    if (error) throw new Error("Unable to follow player.");
  } else {
    const { error } = await supabase
      .from("player_follows")
      .delete()
      .eq("follower_username", viewerUsername)
      .eq("followed_username", followedUsername);
    if (error) throw new Error("Unable to unfollow player.");
  }

  return identityResponse(identity, 200, {
    ok: true,
    username: followedUsername,
    isFollowing: input.action === "follow",
  });
};

export const playerSocialRoute = async (event: FunctionEvent) =>
  event.httpMethod === "GET" ? getPlayerSocial(event) : mutatePlayerSocial(event);
