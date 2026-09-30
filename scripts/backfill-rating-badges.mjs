import { createClient as createArchiveClient } from "@libsql/client/web";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const archive = createArchiveClient({
  url: requiredEnvironment("TURSO_MATCHES_DATABASE_URL"),
  authToken: requiredEnvironment("TURSO_MATCHES_AUTH_TOKEN"),
});
const supabase = createSupabaseClient(
  process.env.SUPABASE_URL?.trim() || requiredEnvironment("VITE_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const modeCategories = new Map([
  [0, "hyperbullet"],
  [1, "bullet"],
  [2, "blitz"],
]);

const { data: badgeRows, error: badgeError } = await supabase
  .from("badges")
  .select("key,category,threshold")
  .in("category", [...modeCategories.values()])
  .eq("active", true);
if (badgeError) throw new Error(`Unable to load rating badges: ${badgeError.message}`);

const badgesByCategory = new Map();
for (const badge of badgeRows ?? []) {
  const category = String(badge.category);
  const badges = badgesByCategory.get(category) ?? [];
  badges.push({ key: String(badge.key), threshold: Number(badge.threshold) });
  badgesByCategory.set(category, badges);
}

const archiveApiBase =
  process.env.ARCHIVE_API_BASE?.trim() || "https://atomicpuzzles.org/api/archive-data";

const fetchArchiveJson = async (params) => {
  const url = `${archiveApiBase}?${params.toString()}`;
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Archive request failed with ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(8_000, 500 * 2 ** attempt) + Math.random() * 250),
      );
    }
  }
  throw lastError;
};

const loadPeaksFromPublicArchive = async () => {
  const ratingRows = await fetchArchiveJson(new URLSearchParams({ resource: "ratings" }));
  const usernames = [
    ...new Set(
      ratingRows
        .filter(
          (row) =>
            ["hyperbullet", "bullet", "blitz"].includes(String(row.tc)) &&
            Number(row.peak) >= 1_500,
        )
        .map((row) => String(row.username).trim().toLowerCase()),
    ),
  ];
  const peaks = [];
  let completed = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (usernames.length) {
      const username = usernames.pop();
      if (!username) continue;
      const byMode = new Map();
      let page = 1;
      let total = 0;
      do {
        const payload = await fetchArchiveJson(
          new URLSearchParams({
            resource: "matches",
            username,
            page: String(page),
            pageSize: "200",
          }),
        );
        total = Number(payload.total ?? 0);
        for (const match of payload.rows ?? []) {
          const category = String(match.mode);
          if (![...modeCategories.values()].includes(category)) continue;
          const playerOne = String(match.player_1).trim().toLowerCase() === username;
          const prefix = playerOne ? "p1" : "p2";
          for (const moment of ["before", "after"]) {
            const rd = Number(match[`${prefix}_${moment}_rd`]);
            const rating = Number(match[`${prefix}_${moment}_rating`]);
            if (rd < 60 && Number.isFinite(rating)) {
              byMode.set(category, Math.max(byMode.get(category) ?? 0, rating));
            }
          }
        }
        page += 1;
      } while ((page - 1) * 200 < total);
      for (const [category, rating] of byMode) peaks.push({ username, category, rating });
      completed += 1;
      if (completed % 100 === 0) console.log(`Scanned ${completed} qualifying players…`);
    }
  });
  await Promise.all(workers);
  return peaks;
};

let peaks;
try {
  const peakResult = await archive.execute(`
    select p.username,qualified.mode,max(qualified.rating) / 10.0 rating
    from (
      select player_1_id player_id,mode,p1_before_rating rating from matches
        where mode in (0,1,2) and p1_before_rd < 600
      union all
      select player_1_id player_id,mode,p1_after_rating rating from matches
        where mode in (0,1,2) and p1_after_rd < 600
      union all
      select player_2_id player_id,mode,p2_before_rating rating from matches
        where mode in (0,1,2) and p2_before_rd < 600
      union all
      select player_2_id player_id,mode,p2_after_rating rating from matches
        where mode in (0,1,2) and p2_after_rd < 600
    ) qualified
    join players p on p.id=qualified.player_id
    group by p.username,qualified.mode
  `);
  peaks = peakResult.rows.map((row) => ({
    username: String(row.username),
    category: modeCategories.get(Number(row.mode)),
    rating: Number(row.rating),
  }));
} catch (error) {
  console.warn(
    `Direct Turso read unavailable (${error.code ?? error.message}); using public archive.`,
  );
  peaks = await loadPeaksFromPublicArchive();
}

const unlocks = [];
for (const row of peaks) {
  const username = String(row.username ?? "")
    .trim()
    .toLowerCase();
  const rating = Math.floor(Number(row.rating));
  const category = row.category;
  if (!username || !category || !Number.isFinite(rating)) continue;
  for (const badge of badgesByCategory.get(category) ?? []) {
    if (rating < badge.threshold) continue;
    unlocks.push({
      username,
      badge_key: badge.key,
      evidence: { category, threshold: badge.threshold, value: rating, backfilled: true },
    });
  }
}

const chunkSize = 500;
for (let index = 0; index < unlocks.length; index += chunkSize) {
  const { error } = await supabase
    .from("user_badges")
    .upsert(unlocks.slice(index, index + chunkSize), {
      onConflict: "username,badge_key",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`Unable to save rating badge backfill: ${error.message}`);
}

console.log(
  `Backfilled ${unlocks.length.toLocaleString("en-US")} permanent rating badge unlocks from ${peaks.length.toLocaleString("en-US")} qualifying player-mode peaks.`,
);
