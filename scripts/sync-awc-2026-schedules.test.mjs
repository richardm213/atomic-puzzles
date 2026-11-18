import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  chooseScheduleFixture,
  fetchSchedulingPosts,
  parseSchedulingPost,
  syncSchedules,
} from "./sync-awc-2026-schedules.mjs";

const history = JSON.parse(
  await readFile(new URL("./fixtures/awc-2026-scheduling-history.json", import.meta.url)),
);
const postsById = new Map(history.map(({ post }) => [post.id, post]));

test("replays every scheduling announcement audited on forum pages 1–17", async () => {
  for (const { post, expectedAt, review } of history) {
    const parsed = parseSchedulingPost(post, postsById);
    equal(Boolean(parsed.review.length), review, `Review disposition for ${post.id}`);
    equal(parsed.schedules.length, expectedAt ? 1 : 0, `Announcement count for ${post.id}`);
    if (!expectedAt) continue;
    const [report] = parsed.schedules;
    equal(report.at, Date.parse(expectedAt), `UTC kickoff for ${post.id}`);
    const row = { id: "historical-fixture", p1: report.p2, p2: report.p1, scheduled_at: null };
    equal(chooseScheduleFixture([row], report), row);
    const published = [];
    const result = await syncSchedules({
      posts: [post],
      rows: [row],
      now: post.time,
      publish: async (update) => {
        published.push(update);
        row.scheduled_at = update.scheduledAt;
        return "applied";
      },
    });
    // Quoted-only reschedules need their earlier post for pairing context.
    if (post.id === "8TSe54d6") {
      const replay = await syncSchedules({
        posts: [postsById.get("GyRK4X6I"), post],
        rows: [{ ...row, scheduled_at: null }],
        now: post.time,
        publish: async (update) => {
          published.push(update);
          return "applied";
        },
      });
      equal(replay.updates.length, 1);
    } else equal(result.updates.length, 1, `Publish plan for ${post.id}`);
    equal(Date.parse(published.at(-1).scheduledAt), Date.parse(expectedAt));
    equal(published.at(-1).p1, report.p2, "Preserves bracket player order");
  }
});

test("uses quoted pair/date only as context for a newly announced reschedule", () => {
  const post = {
    id: "NewPost1",
    page: 18,
    author: "quasabianth",
    time: Date.parse("2026-11-06T15:00Z"),
    text: "> @Quasabianth vs @HowlinD\n> Friday, November 6th, 16 UTC\nMoved by 1h to 17utc",
  };
  const result = parseSchedulingPost(post);
  equal(result.schedules[0].at, Date.parse("2026-11-06T17:00Z"));
  equal(result.schedules[0].reschedule, true);
  deepEqual(
    parseSchedulingPost({ ...post, text: post.text.replace("Moved by 1h to 17utc", "Good luck!") })
      .schedules,
    [],
  );
});

test("publishes only the latest future schedule for one unplayed pairing and is repeatable", async () => {
  const now = Date.parse("2026-11-08T00:00Z");
  const original = {
    id: "OldPost1",
    page: 18,
    author: "alice",
    time: now,
    text: "@Alice vs @Bob November 9 at 10 UTC",
  };
  const moved = {
    ...original,
    id: "NewPost1",
    time: now + 60_000,
    text: "@Alice vs @Bob rescheduled November 9 at 12 UTC",
  };
  const row = { id: "wb-r2-m1", p1: "alice", p2: "bob", scheduled_at: null };
  const applied = [];
  const publish = async (update) => {
    applied.push(update);
    row.scheduled_at = update.scheduledAt;
    return "applied";
  };
  equal(
    (await syncSchedules({ posts: [original, moved], rows: [row], publish, now })).updates.length,
    1,
  );
  equal(applied[0].scheduledAt, "2026-11-09T12:00:00.000Z");
  equal(
    (await syncSchedules({ posts: [original, moved], rows: [row], publish, now })).updates.length,
    0,
  );
  equal(
    chooseScheduleFixture(
      [{ ...row, played_on: "2026-11-08" }],
      parseSchedulingPost(moved).schedules[0],
    ),
    null,
  );
  equal(
    chooseScheduleFixture(
      [row, { ...row, id: "duplicate" }],
      parseSchedulingPost(moved).schedules[0],
    ),
    null,
  );
  ok(!("s1" in applied[0]) && !("match_id" in applied[0]));
});

test("Firefox challenge fallback reads every pagination page and closes its browser", async () => {
  const pages = [];
  let requests = 0,
    closed = 0;
  const html = (
    page,
  ) => `<title>2026 AWC Rounds and Results • page ${page}/20 • Atomic WC • lichess.org</title>
    <article class="forum-post" data-post-id="POST00${page}"><div class="forum-post__metas">
    <a class="author" href="/@/ReChesster">ReChesster</a><time datetime="2026-11-17T22:00:00Z"></time></div>
    <div class="forum-post__message-source">@ReChesster vs. @Maracker scheduled for Sunday, November 22nd at 17:00 UTC</div></article>`;
  const posts = await fetchSchedulingPosts(18, Infinity, undefined, {
    request: async () => {
      requests++;
      return new Response("<title>Just a moment...</title><div>Cloudflare</div>", { status: 403 });
    },
    createBrowser: async () => ({
      read: async (url) => {
        const page = Number(new URL(url).searchParams.get("page"));
        pages.push(page);
        return html(page);
      },
      close: async () => {
        closed++;
      },
    }),
  });
  equal(requests, 1);
  equal(closed, 1);
  deepEqual(pages, [18, 19, 20]);
  equal(posts.length, 3);
  equal(parseSchedulingPost(posts[2]).schedules[0].at, Date.parse("2026-11-22T17:00:00Z"));
});

test("forum failures cannot become partial or empty scheduling successes", async () => {
  let launched = 0,
    closed = 0;
  await rejects(
    fetchSchedulingPosts(18, 18, undefined, {
      request: async () => new Response("Forbidden", { status: 403 }),
      createBrowser: async () => {
        launched++;
      },
    }),
    /HTTP 403/,
  );
  equal(launched, 0);
  await rejects(
    fetchSchedulingPosts(18, 18, undefined, {
      request: async () => new Response("Just a moment: Cloudflare", { status: 403 }),
      createBrowser: async () => ({
        read: async () => "<title>Just a moment...</title>",
        close: async () => {
          closed++;
        },
      }),
    }),
    /Unexpected Lichess pagination/,
  );
  equal(closed, 1);
});
