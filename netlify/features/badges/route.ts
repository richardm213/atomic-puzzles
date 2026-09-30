import { z } from "zod";

import type {
  BadgeCategory,
  BadgeDefinition,
  BadgeTier,
  BadgeTierDefinition,
} from "../../../shared/domain/badges";
import { queryAchievementRatingPeaks } from "../../archive/queries";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { jsonResponse } from "../../platform/response";
import { parseJsonBody } from "../../platform/validation";

const requestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_-]+$/i),
});

type BadgeStats = Record<BadgeCategory, number>;

const countRows = async (
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string,
): Promise<number> => {
  const { count, error } = await query;
  if (error) throw new Error(`Unable to count ${label}: ${error.message}`);
  return Math.max(0, count ?? 0);
};

const loadRatingPeaks = async (username: string) => {
  try {
    return await queryAchievementRatingPeaks(username);
  } catch (error) {
    console.warn("Unable to evaluate rating badges; returning saved achievements.", error);
    return [];
  }
};

export const badgesRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, requestSchema, "Invalid achievements request.");
  const username = input.username.toLowerCase();
  const supabase = createServerSupabase("Achievements service");

  const [catalogResult, tiersResult] = await Promise.all([
    supabase
      .from("badges")
      .select("key,category,threshold,name,description,tier,tier_level,icon_key")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("badge_tiers").select("key,name,rank,description").order("rank"),
  ]);
  const { data: catalogRows, error: catalogError } = catalogResult;
  if (catalogError) throw new Error(`Unable to load the badge catalog: ${catalogError.message}`);
  if (tiersResult.error) {
    throw new Error(`Unable to load badge tiers: ${tiersResult.error.message}`);
  }
  const tiers: BadgeTierDefinition[] = (tiersResult.data ?? []).map((row) => ({
    key: String(row.key) as BadgeTier,
    name: String(row.name),
    rank: Number(row.rank),
    description: String(row.description),
  }));
  const tierNames = new Map(tiers.map((tier) => [tier.key, tier.name]));
  const catalog: BadgeDefinition[] = (catalogRows ?? []).map((row) => ({
    key: String(row.key),
    category: String(row.category) as BadgeCategory,
    threshold: Number(row.threshold),
    name: String(row.name),
    description: String(row.description),
    tier: String(row.tier) as BadgeDefinition["tier"],
    tierName: tierNames.get(String(row.tier) as BadgeTier) ?? String(row.tier),
    tierLevel: Number(row.tier_level),
    iconKey: String(row.icon_key) as BadgeCategory,
  }));

  const [attempted, correct, created, ratingPeaks] = await Promise.all([
    countRows(
      supabase
        .from("puzzle_progress")
        .select("puzzle_id", { count: "exact", head: true })
        .eq("username", username),
      "attempted puzzles",
    ),
    countRows(
      supabase
        .from("puzzle_progress")
        .select("puzzle_id", { count: "exact", head: true })
        .eq("username", username)
        .eq("puzzle_correct", true),
      "correct puzzles",
    ),
    countRows(
      supabase.from("puzzles").select("id", { count: "exact", head: true }).eq("author", username),
      "created puzzles",
    ),
    loadRatingPeaks(username),
  ]);

  const stats: BadgeStats = {
    attempted,
    correct,
    created,
    blitz: 0,
    bullet: 0,
    hyperbullet: 0,
  };
  for (const peak of ratingPeaks) stats[peak.mode] = Math.floor(peak.rating);

  const newlyEarned = catalog
    .filter((badge) => stats[badge.category] >= badge.threshold)
    .map((badge) => ({
      username,
      badge_key: badge.key,
      evidence: {
        category: badge.category,
        threshold: badge.threshold,
        value: stats[badge.category],
      },
    }));

  if (newlyEarned.length) {
    const { error } = await supabase
      .from("user_badges")
      .upsert(newlyEarned, { onConflict: "username,badge_key", ignoreDuplicates: true });
    if (error) throw new Error(`Unable to save achievements: ${error.message}`);
  }

  const { data, error } = await supabase
    .from("user_badges")
    .select("badge_key,earned_at")
    .eq("username", username)
    .order("earned_at", { ascending: false });
  if (error) throw new Error(`Unable to load achievements: ${error.message}`);

  const knownKeys = new Set(catalog.map((badge) => badge.key));
  const earned = (data ?? []).flatMap((row) => {
    const badgeKey = String(row.badge_key ?? "");
    if (!knownKeys.has(badgeKey)) return [];
    return [{ badgeKey, earnedAt: String(row.earned_at ?? "") }];
  });

  return jsonResponse(200, { username, stats, tiers, catalog, earned });
};
