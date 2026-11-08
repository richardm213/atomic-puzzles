import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const forum = "https://lichess.org/forum/team-atomic-wc/2026-awc-rounds-and-results";
const archive = "https://atomicpuzzles.org/api/archive-data";
const currentSupabase = "https://arkicplonaruvmhhvwxd.supabase.co";
const director = "atomicworldchamp";
const firstPage = 18;
const day = 86_400_000;
const name = "@([a-z0-9_-]{2,30})";
const score = "(\\d{1,2}(?:\\.5)?)\\s*[-–—:]\\s*(\\d{1,2}(?:\\.5)?)";
const versus = "\\s+vs\\.?\\s+";
const gamePattern = /https:\/\/lichess\.org\/(?:game\/)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?=[\s#?)/\].,!]|$)/g;
const validGameId = /^[a-zA-Z0-9]{8}$/;
const knockoutId = /^(?:wb-r[123]-m[1-8]|wb-final|lb-r[1-5]-m[1-4]|lb-final|grand-final-(?:set-1|reset))$/;
const player = (value) => {
  const key = String(value ?? "").trim().toLowerCase();
  // The director's page-18 spelling for the matchup in the kickoff migration.
  return key === "tolyastarina0991" ? "tolya_starina0995" : key;
};
const pairKey = (p1, p2) => [player(p1), player(p2)].sort().join("/");
const dateString = (time) => new Date(time).toISOString().slice(0, 10);
const played = (row) => Boolean(row.match_id || row.played_on || row.outcome_type || Number(row.s1) || Number(row.s2));
const timestamp = (value) => typeof value === "number" ? value : Date.parse(value);
const sameInstant = (a, b) => timestamp(a) === timestamp(b);

export function parseForumPage(html, page) {
  const { window } = new JSDOM(html);
  try {
    const doc = window.document;
    const title = doc.title.match(/^2026 AWC Rounds and Results .*?page (\d+)\/(\d+) /i);
    if (!title || Number(title[1]) !== page || Number(title[2]) < page || Number(title[2]) > 100) {
      throw new Error(`Unexpected Lichess pagination on page ${page}`);
    }
    const articles = [...doc.querySelectorAll("article.forum-post[data-post-id]")];
    if (!articles.length) throw new Error(`No forum posts found on page ${page}`);
    const posts = articles.flatMap((article) => {
      const source = article.querySelector(".forum-post__message-source");
      if (!source) return [];
      const id = article.getAttribute("data-post-id");
      const metas = article.querySelector(".forum-post__metas");
      const author = metas?.querySelector("a.author")?.getAttribute("href")?.match(/^\/@\/([\w-]+)$/)?.[1];
      const time = Date.parse(metas?.querySelector("time[datetime]")?.getAttribute("datetime") ?? "");
      if (!validGameId.test(id) || !Number.isFinite(time)) throw new Error(`Unexpected forum post on page ${page}`);
      return [{ id, page, author: player(author), time, text: source.textContent }];
    });
    if (!posts.length) throw new Error(`No readable forum posts on page ${page}`);
    return { posts, lastPage: Number(title[2]) };
  } finally {
    window.close();
  }
}

const months = "january february march april may june july august september october november december".split(" ");
const monthPattern = months.map((month) => `${month.slice(0, 3)}(?:${month.slice(3)})?`).join("|");
const monthFirst = new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");
const dateFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\b`, "i");

function scheduleDate(text, post) {
  const iso = text.match(/\b(2026)-(\d{2})-(\d{2})\b/);
  const md = text.match(monthFirst);
  const dm = text.match(dateFirst);
  if (iso || md || dm) {
    const month = iso ? Number(iso[2]) - 1 : months.findIndex((m) => m.startsWith((md?.[1] ?? dm[2]).toLowerCase()));
    const date = Number(iso?.[3] ?? md?.[2] ?? dm[1]);
    const time = Date.UTC(2026, month, date);
    return new Date(time).getUTCMonth() === month ? time : null;
  }
  // A director's multi-fixture announcement can set the date once in the heading.
  if (post.author === director && /\b(today|tomorrow)\b/i.test(text)) {
    return Date.parse(dateString(post.time)) + (/\btomorrow\b/i.test(text) ? day : 0);
  }
  return null;
}

function scheduleTime(line, heading, post) {
  if (/\b(?:tentative|maybe|probably|proposed|not confirmed|around|or|between|approx\w*)\b|\?/i.test(line)) return null;
  const clock = [...line.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(UTC|GMT)\b/gi)];
  if (clock.length !== 1 || Number(clock[0][1]) >= 24) return null;
  if (/\b(?:am|pm)\b|(?:UTC|GMT)\s*[+−-]\s*\d/i.test(line)) return null;
  const date = scheduleDate(line, post) ?? scheduleDate(heading, post);
  return date === null ? null : date + (Number(clock[0][1]) * 60 + Number(clock[0][2] ?? 0)) * 60_000;
}

export function parsePost(post) {
  const lines = post.text.split(/\r?\n/).map((line) => line.trim()).filter((line) =>
    line && !line.startsWith(">") && !/said \[\^\]\(/.test(line));
  const text = lines.join("\n");
  const resultPatterns = [
    [new RegExp(`^${name}\\s+${score}\\s+${name}(?=\\s|[.,!]|$)`, "i"), [1, 4, 2, 3]],
    [new RegExp(`^${name}${versus}${name}\\s*[:,]?\\s+${score}(?!\\.\\d)(?=\\s|[.,!]|$)`, "i"), [1, 2, 3, 4]],
    [new RegExp(`^${name}\\s+(?:beat|defeated)\\s+${name}\\s+${score}(?!\\.\\d)(?=\\s|[.,!]|$)`, "i"), [1, 2, 3, 4]],
  ];
  const reports = [];
  const gameIds = [...new Set([...text.matchAll(gamePattern)].map((match) => match[1]))];
  for (const line of lines) {
    for (const [pattern, indexes] of resultPatterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const [p1, p2, s1, s2] = indexes.map((i) => match[i]);
      if (Number(s1) === Number(s2) || Math.max(Number(s1), Number(s2)) < 5.5 || !gameIds.length ||
          /\b(?:predict\w*|currently|was up|in progress|if|maybe|will)\b|\?/i.test(line)) break;
      reports.push({ ...post, type: "result", p1: player(p1), p2: player(p2), s1: Number(s1), s2: Number(s2), gameIds });
      break;
    }
  }
  if (reports.length) return reports.length === 1 ? reports : [{ ...post, type: "review" }];

  const pairing = new RegExp(`^${name}${versus}${name}(?=\\s|[:,.]|$)`, "i");
  let heading = "";
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(pairing);
    if (!match) {
      heading = line;
      continue;
    }
    const [p1, p2] = [player(match[1]), player(match[2])];
    if (post.author !== director && ![p1, p2].includes(post.author)) continue;
    const next = lines[index + 1] ?? "";
    const details = next.match(pairing) ? line : `${line} ${next}`;
    const at = scheduleTime(details, post.author === director ? heading : "", post);
    if (at !== null && at > post.time && at - post.time <= 21 * day) {
      reports.push({ ...post, type: "schedule", p1, p2, at });
    }
  }
  if (reports.length) return reports;
  return gameIds.length || /\b(?:withdr[ea]w\w*|forfeit\w*|disqualif\w*|reschedul\w*|moved by)\b/i.test(text)
    ? [{ ...post, type: "review" }]
    : [];
}

export function archiveScores(row) {
  return row.games.reduce(([a, b], game) => {
    const [id, , result, white] = game.split(",");
    if (!validGameId.test(id) || !["0", "1", "2"].includes(result) || !["1", "2"].includes(white)) {
      throw new Error("Unexpected archived game encoding");
    }
    if (result === "0") return [a + 0.5, b + 0.5];
    const p1Won = result === white;
    return [a + Number(p1Won), b + Number(!p1Won)];
  }, [0, 0]);
}

function compareReports(a, b) {
  return a.p1 === b.p1 ? a.s1 === b.s1 && a.s2 === b.s2 : a.s1 === b.s2 && a.s2 === b.s1;
}

export function chooseFixture(rows, report, time) {
  const candidates = rows.filter((row) => knockoutId.test(row.id) &&
    pairKey(row.p1, row.p2) === pairKey(report.p1, report.p2));
  const relevant = candidates.filter((row) => !played(row) ||
    (row.played_on && Math.abs(Date.parse(row.played_on) - time) < 2 * day));
  if (relevant.length !== 1) return null;
  const row = relevant[0];
  // Do not write a grand final reset before the lower-bracket finalist wins set 1.
  if (row.id === "grand-final-reset") {
    const first = rows.find((match) => match.id === "grand-final-set-1");
    if (!(Number(first?.s2) > Number(first?.s1))) return null;
  }
  return row;
}

export function advancement(rows, row, s1, s2) {
  const winner = s1 > s2 ? row.p1 : row.p2;
  const loser = s1 > s2 ? row.p2 : row.p1;
  const change = (id, side, name) => {
    const targets = rows.filter((entry) => entry.id === id);
    if (targets.length !== 1) throw new Error("Missing or duplicate advancement slot");
    const target = targets[0];
    if (player(target[side]) === player(name)) return [];
    if (played(target) || target[side] || player(target[side === "p1" ? "p2" : "p1"]) === player(name)) {
      throw new Error("Conflicting advancement slot");
    }
    return [{ id, side, player: name }];
  };
  if (row.id === "grand-final-set-1") {
    return s2 > s1
      ? [...change(row.winner_to, "p1", row.p1), ...change(row.winner_to, "p2", row.p2)]
      : [];
  }
  return [[row.winner_to, "winner_to", winner], [row.loser_to, "loser_to", loser]].flatMap(([id, edge, name]) => {
    if (!id) return [];
    if (id === "grand-final-set-1") return change(id, row.id === "wb-final" ? "p1" : "p2", name);
    const feeders = rows.flatMap((source) => ["winner_to", "loser_to"].filter((key) => source[key] === id)
      .map((key) => ({ source, key })));
    // Within a round follow bracket order; mixed losers rounds take the lower-bracket winner first.
    feeders.sort((a, b) => Number(a.key === "loser_to") - Number(b.key === "loser_to") || a.source.order - b.source.order);
    const index = feeders.findIndex(({ source, key }) => source.id === row.id && key === edge);
    if (feeders.length !== 2 || index < 0) throw new Error("Unknown advancement topology");
    return change(id, index === 0 ? "p1" : "p2", name);
  });
}

async function request(url, options = {}, allowMissing = false) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error(`Connection failed: ${url.host}${url.pathname}`);
  }
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url.host}${url.pathname}`);
  return response;
}

async function getPosts() {
  const posts = new Map();
  for (let page = firstPage, last = firstPage; page <= last; page++) {
    const url = new URL(forum);
    url.searchParams.set("page", String(page));
    const result = parseForumPage(await (await request(url)).text(), page);
    for (const post of result.posts) posts.set(post.id, post);
    last = Math.max(last, result.lastPage);
  }
  return [...posts.values()].sort((a, b) => a.time - b.time);
}

async function archivedResult(report, mode) {
  const fetchArchive = async (params) => {
    const url = new URL(archive);
    url.search = new URLSearchParams(params);
    return (await request(url)).json();
  };
  const matches = new Map();
  let playedAt = null;
  for (const id of report.gameIds) {
    const game = await fetchArchive({ resource: "game", gameId: id });
    if (game) {
      if (game.mode !== mode || game.time_control !== "3+2" || pairKey(game.player_1, game.player_2) !== pairKey(report.p1, report.p2)) return null;
      const { rows } = await fetchArchive({ resource: "matches", mode, matchId: game.external_match_id, includeTotal: "false" });
      if (rows.length !== 1 || pairKey(rows[0].player_1, rows[0].player_2) !== pairKey(report.p1, report.p2) ||
          !rows[0].games.some((entry) => entry.split(",")[0] === id)) return null;
      matches.set(rows[0].match_id, rows[0]);
      playedAt = Number(rows[0].start_ts);
    } else {
      const response = await request(new URL(`https://lichess.org/game/export/${id}`),
        { headers: { Accept: "application/json" } }, true);
      const live = await response?.json();
      if (!live || live.id !== id || live.variant !== "atomic" || live.clock?.initial !== 180 || live.clock?.increment !== 2 ||
          !["mate", "resign", "stalemate", "timeout", "draw", "outoftime", "variantEnd"].includes(live.status) ||
          pairKey(live.players?.white?.user?.id, live.players?.black?.user?.id) !== pairKey(report.p1, report.p2)) return null;
      playedAt ??= Number(live.createdAt);
    }
  }
  if (!Number.isFinite(playedAt) || Math.abs(playedAt - report.time) >= 2 * day || matches.size > 1) return null;
  const match = [...matches.values()][0];
  if (match) {
    const scores = archiveScores(match);
    if (player(match.player_1) !== report.p1) scores.reverse();
    if (scores[0] !== report.s1 || scores[1] !== report.s2 || !validGameId.test(match.match_id)) return null;
  }
  return { matchId: match?.match_id ?? "", playedAt };
}

const rowColumns = "id,p1,p2,s1,s2,match_id,played_on,outcome_type,scheduled_at,winner_to,loser_to,order";
const postUrl = (report) => `${forum}?page=${report.page}#${report.id}`;

async function run() {
  const { AWC_SUPABASE_URL: base, AWC_SUPABASE_ANON_KEY: apikey, AWC_BRACKET_TOKEN: token } = process.env;
  const publish = process.env.AWC_PUBLISH === "true";
  if (!base || !apikey || (publish && !token)) throw new Error("AWC forum sync credentials are not configured");
  if (new URL(base).origin !== currentSupabase) throw new Error("Use the current Supabase project for the AWC worker");
  const api = async (path, params, payload) => {
    const url = new URL(`/rest/v1/${path}`, base);
    url.search = new URLSearchParams(params);
    const options = payload ? {
      method: "POST",
      headers: { apikey, "Content-Type": "application/json", "x-awc-bracket-token": token },
      body: JSON.stringify(payload),
    } : { headers: { apikey } };
    return (await request(url, options)).json();
  };
  const loadRows = () => api("tournament_matches", { select: rowColumns, tournament: "eq.awc2026" });
  const [posts, catalog, rows] = await Promise.all([
    getPosts(),
    api("tournament_catalog", { select: "match_mode", id: "eq.awc2026" }),
    loadRows(),
  ]);
  if (catalog.length !== 1 || catalog[0].match_mode !== "blitz" ||
      !rows.some((row) => knockoutId.test(row.id)) || new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error("Unexpected production bracket or tournament configuration");
  }

  if (publish && await api("rpc/apply_awc_2026_forum_update", {}, { expected: {}, patch: {}, advance: [] }) !== true) {
    throw new Error("The production bracket writer did not pass its credential check");
  }
  const lines = [];
  const applied = async (row, patch, advance, report) => {
    if (publish) {
      await api("rpc/apply_awc_2026_forum_update", {}, { expected: row, patch, advance });
      const fresh = await loadRows();
      const verified = fresh.find((entry) => entry.id === row.id);
      for (const [key, value] of Object.entries(patch)) {
        if (!verified || !(key === "scheduled_at" ? sameInstant(value, verified[key]) : value === verified[key])) {
          throw new Error("Production read-back did not match the submitted update");
        }
      }
      for (const { id, side, player: name } of advance) {
        if (fresh.find((entry) => entry.id === id)?.[side] !== name) throw new Error("Advancement read-back failed");
      }
      rows.splice(0, rows.length, ...fresh);
    } else {
      Object.assign(row, patch);
      for (const { id, side, player: name } of advance) rows.find((entry) => entry.id === id)[side] = name;
    }
    lines.push(`- ${publish ? "Published" : "Would publish"} ${row.id}: ${patch.scheduled_at ?? (patch.s1 === undefined ? "archive link" : `${patch.s1}–${patch.s2}`)}${patch.match_id === "" ? " (awaiting archive)" : ""} · ${postUrl(report)}`);
  };
  const reports = posts.flatMap(parsePost);
  const review = (report, reason) => lines.push(`- Review: ${reason} · ${postUrl(report)}`);
  for (const report of reports) {
    if (report.type === "review") {
      review(report, "Result or change needs manual interpretation");
      continue;
    }
    const samePair = (other) => other.type === report.type &&
      pairKey(other.p1, other.p2) === pairKey(report.p1, report.p2) &&
      Math.abs(other.time - report.time) < 2 * day;
    if (reports.some((other) => samePair(other) && (report.type === "result"
      ? !compareReports(report, other) : report.at !== other.at))) {
      review(report, "Conflicting posts for this pairing");
      continue;
    }
    if (report.type === "schedule") {
      if (report.at <= Date.now()) continue;
      const row = chooseFixture(rows, report, report.at);
      if (!row || played(row)) {
        if (!row) review(report, "No unique bracket slot for scheduled match");
        continue;
      }
      if (sameInstant(row.scheduled_at, report.at)) continue;
      if (row.scheduled_at) {
        review(report, "Existing kickoff differs; no automatic reschedule");
        continue;
      }
      await applied(row, { scheduled_at: new Date(report.at).toISOString() }, [], report);
      continue;
    }
    if (![report.p1, report.p2, director].includes(report.author)) {
      review(report, "Result not posted by a participant or the director");
      continue;
    }
    const row = chooseFixture(rows, report, report.time);
    if (!row) {
      review(report, "No unique bracket slot for result");
      continue;
    }
    const scores = player(row.p1) === report.p1 ? [report.s1, report.s2] : [report.s2, report.s1];
    if (played(row) && (Number(row.s1) !== scores[0] || Number(row.s2) !== scores[1] || row.outcome_type)) {
      review(report, "Result conflicts with the bracket");
      continue;
    }
    if (row.match_id) continue;
    const confirmed = await archivedResult(report, catalog[0].match_mode);
    if (!confirmed) {
      review(report, "Could not verify cited games and result");
      continue;
    }
    if (played(row)) {
      if (confirmed.matchId) await applied(row, { match_id: confirmed.matchId }, [], report);
    } else {
      let advance;
      try {
        advance = advancement(rows, row, ...scores);
      } catch (error) {
        review(report, error.message);
        continue;
      }
      await applied(row, {
        s1: scores[0], s2: scores[1], played_on: dateString(confirmed.playedAt), match_id: confirmed.matchId,
      }, advance, report);
    }
  }
  const summary = `## AWC 2026 forum sync (${publish ? "live" : "dry run"})\n\n${lines.join("\n") || "No new verified results or schedules."}\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
