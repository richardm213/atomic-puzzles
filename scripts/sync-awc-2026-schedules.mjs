import { appendFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseForumPage } from "./sync-awc-2026-forum.mjs";

export const FORUM = "https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results";
export const CURRENT_SUPABASE = "https://arkicplonaruvmhhvwxd.supabase.co";
export const STOP_AT = Date.parse("2026-12-09T00:00:00Z");
const DAY = 86_400_000;
const organizers = new Set(["howlind", "atomicworldchamp"]);
const months =
  "january february march april may june july august september october november december".split(
    " ",
  );
const monthPattern = months.map((m) => `${m.slice(0, 3)}(?:${m.slice(3)})?`).join("|");
const weekdays = "sunday monday tuesday wednesday thursday friday saturday".split(" ");
export const canonicalPlayer = (value) => {
  const name = String(value ?? "")
    .replace(/^@/, "")
    .toLowerCase();
  return name === "tolyastarina0991" ? "tolya_starina0995" : name;
};
const pairKey = (a, b) => [canonicalPlayer(a), canonicalPlayer(b)].sort().join("/");
const originalLines = (post) =>
  post.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">") && !/said \[\^\]\(/.test(l));
const trusted = (post, pair) =>
  organizers.has(post.author) || pair.includes(canonicalPlayer(post.author));
export const isUnplayed = (row) =>
  !row.played_on && !row.match_id && !row.outcome_type && !Number(row.s1) && !Number(row.s2);

function findPair(text, author) {
  const direct =
    /@([\w-]{2,30})\s+(?:vs\.?|against)\s+@([\w-]{2,30})\b/i.exec(text) ??
    /^@?([\w-]{2,30})\s+vs\.?\s+@?([\w-]{2,30})\b/i.exec(text) ??
    /\bbetween\s+@([\w-]{2,30})\s+and\s+@([\w-]{2,30})\b/i.exec(text);
  if (direct) return [direct[1], direct[2]].map(canonicalPlayer);
  const implicit =
    /@([\w-]{2,30})\s+(?:against\s+me|and\s+I)\b/i.exec(text) ??
    /\b(?:i\s+and|between)\s+@([\w-]{2,30})(?:\s+and\s+me)?\b/i.exec(text);
  return implicit ? [canonicalPlayer(implicit[1]), canonicalPlayer(author)] : null;
}

function referencedSchedule(post, postsById) {
  const references = [...post.text.matchAll(/said \[\^\]\(\/forum\/redirect\/post\/([\w]{8})\)/g)]
    .map((match) => postsById.get(match[1]))
    .filter(Boolean);
  const quoted = post.text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith(">"))
    .map((line) => line.replace(/^\s*>+\s*/, ""))
    .join(" ");
  const contexts = [
    ...references.map((p) => ({ ...p, text: originalLines(p).join(" ") })),
    { ...post, text: quoted },
  ];
  const pairs = contexts.map((p) => findPair(p.text, p.author)).filter(Boolean);
  const unique = new Map(pairs.map((pair) => [pairKey(...pair), pair]));
  if (unique.size !== 1) return null;
  const dates = new Set(contexts.map((p) => parseDate(p.text, p)).filter((date) => date !== null));
  return { pair: [...unique.values()][0], date: dates.size === 1 ? [...dates][0] : null };
}

function parseDate(text, post) {
  if ([...text.matchAll(/\b(20\d{2})\b/g)].some((match) => match[1] !== "2026")) return null;
  const iso = /\b(2026)-(\d{2})-(\d{2})\b/.exec(text);
  const md = new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i").exec(
    text,
  );
  const dm = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthPattern})\\b`,
    "i",
  ).exec(text);
  if (iso || md || dm) {
    const useDayFirst = dm && (!md || dm.index < md.index);
    const month = iso
      ? Number(iso[2]) - 1
      : months.findIndex((m) => m.startsWith((useDayFirst ? dm[2] : md[1]).toLowerCase()));
    const date = Number(iso?.[3] ?? (useDayFirst ? dm[1] : md[2]));
    const value = Date.UTC(2026, month, date);
    const weekday = new RegExp(`\\b(${weekdays.join("|")})\\b`, "i").exec(text);
    if (weekday && weekdays.indexOf(weekday[1].toLowerCase()) !== new Date(value).getUTCDay())
      return null;
    return new Date(value).getUTCMonth() === month && new Date(value).getUTCDate() === date
      ? value
      : null;
  }
  const midnight = Date.parse(new Date(post.time).toISOString().slice(0, 10));
  if (/\btomorrow\b/i.test(text)) return midnight + DAY;
  if (/\btoday\b/i.test(text)) return midnight;
  const weekday = new RegExp(`\\b(${weekdays.join("|")})\\b`, "i").exec(text);
  if (!weekday) return null;
  const offset =
    (weekdays.indexOf(weekday[1].toLowerCase()) - new Date(post.time).getUTCDay() + 7) % 7;
  // "Next Saturday" can mean either the coming Saturday or the following week.
  if (/\bnext\s+(?:sun|mon|tues|wednes|thurs|fri|satur)day\b/i.test(text)) return null;
  return midnight + offset * DAY;
}

function kickoff(text, post) {
  if (
    /\b(?:around|approximately|approx|tentative|maybe|probably|proposed|or)\b|\bbetween\s+\d|\?/i.test(
      text,
    )
  )
    return null;
  const relative = /\b(?:starting|starts?|in)\s+(?:in\s+)?(\d{1,3})\s+minutes?\b/i.exec(text);
  if (relative && !/UTC|GMT/i.test(text)) return post.time + Number(relative[1]) * 60_000;
  const normalized = text.replace(/\b([ap])\.\s*m\./gi, "$1m");
  const clocks = [
    ...normalized.matchAll(
      /\b(\d{1,4})(?::([0-5]\d))?\s*(am|pm)?\s*(UTC|GMT)(?:\s*([+-])\s*(\d{1,2})(?::([0-5]\d))?)?\b/gi,
    ),
  ];
  // Also accept a timezone before an AM/PM clock, e.g. "UTC 4 pm".
  const prefix = /\b(?:UTC|GMT)\s+(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i.exec(normalized);
  if (!clocks.length && prefix) clocks.push(prefix);
  if (clocks.length !== 1) return null;
  const match = clocks[0];
  let hour = Number(match[1]);
  const minute =
    match[2] === undefined && match[1].length === 4 ? hour % 100 : Number(match[2] ?? 0);
  if (match[1].length === 4) hour = Math.floor(hour / 100);
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  }
  if (hour >= 24 || minute >= 60 || Number(match[6] ?? 0) > 14) return null;
  const date = parseDate(text, post);
  if (date === null) return null;
  const offset = (Number(match[6] ?? 0) * 60 + Number(match[7] ?? 0)) * (match[5] === "-" ? -1 : 1);
  return date + (hour * 60 + minute - offset) * 60_000;
}

export function parseSchedulingPost(post, postsById = new Map()) {
  const lines = originalLines(post);
  const schedules = [],
    review = [];
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pair = findPair(line, post.author);
    if (!pair) {
      heading = line;
      continue;
    }
    const nextPair = lines.findIndex(
      (candidate, index) => index > i && findPair(candidate, post.author),
    );
    const details = [line, ...lines.slice(i + 1, nextPair < 0 ? lines.length : nextPair)]
      .join(" ")
      .split(/\bIf\s+the\s+match\b/i)[0];
    if (
      !/(?:UTC|GMT|\bCET\b|\bCEST\b|\bBST\b|\bEST\b|\bPST\b|\bIST\b|\bminutes?\b|\breschedul\w*|\bdelay\w*)/i.test(
        details,
      )
    )
      continue;
    if (!trusted(post, pair)) {
      review.push("Scheduling announcement is not from an organizer or either player");
      continue;
    }
    const at = kickoff(`${organizers.has(post.author) ? heading : ""} ${details}`, post);
    if (at === null || at <= post.time || at - post.time > 21 * DAY) {
      review.push("Scheduling announcement has an ambiguous or invalid kickoff");
      continue;
    }
    schedules.push({
      ...post,
      p1: pair[0],
      p2: pair[1],
      at,
      reschedule: /\b(?:reschedul\w*|delay\w*|moved)\b/i.test(details),
    });
  }
  if (
    !schedules.length &&
    !review.length &&
    /\b(?:reschedul\w*|delay\w*|moved)\b/i.test(lines.join(" "))
  ) {
    const reference = referencedSchedule(post, postsById);
    const pair = reference?.pair;
    if (pair && trusted(post, pair)) {
      let details = lines.join(" ");
      const hasDateHint = new RegExp(
        `\\b(?:${monthPattern}|${weekdays.join("|")}|today|tomorrow|20\\d{2})\\b`,
        "i",
      ).test(details);
      if (parseDate(details, post) === null && reference.date !== null && !hasDateHint) {
        details += ` ${new Date(reference.date).toISOString().slice(0, 10)}`;
      }
      const at = kickoff(details, post);
      if (at !== null && at > post.time && at - post.time <= 21 * DAY)
        schedules.push({ ...post, p1: pair[0], p2: pair[1], at, reschedule: true });
      else review.push("Reschedule needs a precise date and kickoff");
    } else review.push("Reschedule could not be tied to one authenticated pairing");
  }
  return { schedules, review };
}

export function chooseScheduleFixture(rows, report, historical = false) {
  const candidates = rows.filter(
    (row) =>
      pairKey(row.p1, row.p2) === pairKey(report.p1, report.p2) &&
      (historical
        ? !row.played_on || Math.abs(Date.parse(row.played_on) - report.at) < 3 * DAY
        : isUnplayed(row)),
  );
  return candidates.length === 1 ? candidates[0] : null;
}

export async function fetchSchedulingPosts(first = 18, last = Infinity, saveDirectory) {
  const posts = new Map();
  for (let page = first, end = first; page <= Math.min(end, last); page++) {
    const response = await fetch(`${FORUM}?page=${page}`, {
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Forum page ${page}: HTTP ${response.status}`);
    const html = await response.text();
    if (saveDirectory) await writeFile(`${saveDirectory}/page-${page}.html`, html);
    const parsed = parseForumPage(html, page);
    for (const post of parsed.posts) posts.set(post.id, post);
    end = Math.max(end, parsed.lastPage);
  }
  return [...posts.values()].sort((a, b) => a.time - b.time);
}

export async function syncSchedules({ posts, rows, publish, now = Date.now() }) {
  const lines = [],
    updates = [];
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const reports = posts.flatMap((post) => {
    const parsed = parseSchedulingPost(post, postsById);
    for (const reason of parsed.review)
      lines.push(`- Review: ${reason} · ${FORUM}?page=${post.page}#${post.id}`);
    return parsed.schedules;
  });
  const newest = new Map();
  for (const report of reports) newest.set(pairKey(report.p1, report.p2), report);
  for (const report of newest.values()) {
    if (report.at <= now) continue;
    const row = chooseScheduleFixture(rows, report);
    if (!row) {
      lines.push(
        `- Review: no unique unplayed bracket match · ${FORUM}?page=${report.page}#${report.id}`,
      );
      continue;
    }
    if (row.scheduled_at && Date.parse(row.scheduled_at) === report.at) continue;
    if (row.scheduled_at && !report.reschedule) {
      lines.push(
        `- Review: changed kickoff without an explicit reschedule · ${FORUM}?page=${report.page}#${report.id}`,
      );
      continue;
    }
    const update = {
      fixtureId: row.id,
      p1: row.p1,
      p2: row.p2,
      expectedScheduledAt: row.scheduled_at,
      scheduledAt: new Date(report.at).toISOString(),
      sourcePostId: report.id,
      sourcePostedAt: new Date(report.time).toISOString(),
      sourceUrl: `${FORUM}?page=${report.page}#${report.id}`,
      reschedule: report.reschedule,
    };
    const result = publish ? await publish(update) : "dry-run";
    updates.push({ ...update, result });
    lines.push(`- ${result}: ${row.p1} vs ${row.p2} · ${update.scheduledAt} · ${update.sourceUrl}`);
  }
  return { lines, updates, reports };
}

export function auditSchedulingHistory(posts, expected) {
  const byId = new Map(posts.map((post) => [post.id, post]));
  const cases = new Map(expected.map((entry) => [entry.post.id, entry]));
  const reviewed = [],
    recognized = [];
  for (const post of posts) {
    const actual = parseSchedulingPost(post, byId);
    const expectation = cases.get(post.id);
    const actualAt = actual.schedules.map((report) => new Date(report.at).toISOString());
    const expectedAt = expectation?.expectedAt
      ? [new Date(expectation.expectedAt).toISOString()]
      : [];
    if (
      JSON.stringify(actualAt) !== JSON.stringify(expectedAt) ||
      Boolean(actual.review.length) !== Boolean(expectation?.review)
    ) {
      throw new Error(`Historical scheduling audit mismatch at page ${post.page}, post ${post.id}`);
    }
    if (actual.schedules.length) recognized.push(post.id);
    if (actual.review.length) reviewed.push(post.id);
    cases.delete(post.id);
  }
  if (cases.size) throw new Error("Historical audit did not find every expected source post");
  return { posts: posts.length, recognized, reviewed };
}

async function run() {
  if (process.argv.includes("--audit-history")) {
    const posts = await fetchSchedulingPosts(1, 17);
    const expected = JSON.parse(
      await readFile(new URL("./fixtures/awc-2026-scheduling-history.json", import.meta.url)),
    );
    const audit = auditSchedulingHistory(posts, expected);
    console.log(JSON.stringify(audit, null, 2));
    return;
  }
  if (Date.now() >= STOP_AT) {
    console.log("AWC scheduling window ended; no database changes.");
    return;
  }
  const base = process.env.AWC_SUPABASE_URL;
  const apikey = process.env.AWC_SUPABASE_ANON_KEY;
  const token = process.env.AWC_SCHEDULE_TOKEN;
  const live = process.env.AWC_SCHEDULE_PUBLISH === "true" && !process.argv.includes("--dry-run");
  if (!base || new URL(base).origin !== CURRENT_SUPABASE || !apikey || (live && !token))
    throw new Error("Current AWC scheduling credentials are not configured");
  const api = async (path, body) => {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        apikey,
        ...(body ? { "Content-Type": "application/json", "x-awc-schedule-token": token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Scheduling API: ${response.status} ${JSON.stringify(data)}`);
    return data;
  };
  if (live) {
    const check = await api("rpc/apply_awc_2026_schedule", {
      p_fixture_id: null,
      p_p1: null,
      p_p2: null,
      p_expected_scheduled_at: null,
      p_scheduled_at: null,
      p_source_post_id: null,
      p_source_posted_at: null,
      p_source_url: null,
      p_reschedule: false,
    });
    if (check !== "credential verified") throw new Error("Scheduling credential check failed");
  }
  const rows = await api(
    "tournament_matches?" +
      new URLSearchParams({
        tournament: "eq.awc2026",
        select: "id,p1,p2,s1,s2,played_on,match_id,outcome_type,scheduled_at",
      }),
  );
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error("Duplicate bracket IDs");
  const posts = await fetchSchedulingPosts();
  const result = await syncSchedules({
    posts,
    rows,
    publish: live
      ? async (update) => {
          const outcome = await api("rpc/apply_awc_2026_schedule", {
            p_fixture_id: update.fixtureId,
            p_p1: update.p1,
            p_p2: update.p2,
            p_expected_scheduled_at: update.expectedScheduledAt,
            p_scheduled_at: update.scheduledAt,
            p_source_post_id: update.sourcePostId,
            p_source_posted_at: update.sourcePostedAt,
            p_source_url: update.sourceUrl,
            p_reschedule: update.reschedule,
          });
          if (outcome === "applied") {
            const [fresh] = await api(
              "tournament_matches?" +
                new URLSearchParams({
                  tournament: "eq.awc2026",
                  id: `eq.${update.fixtureId}`,
                  select: "p1,p2,scheduled_at",
                }),
            );
            if (
              !fresh ||
              fresh.p1 !== update.p1 ||
              fresh.p2 !== update.p2 ||
              Date.parse(fresh.scheduled_at) !== Date.parse(update.scheduledAt)
            )
              throw new Error("Schedule read-back failed");
          }
          return outcome;
        }
      : undefined,
  });
  const summary = `## AWC schedule sync (${live ? "live" : "dry run"})\n\n${result.lines.join("\n") || "No new future schedules."}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
