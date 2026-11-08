import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";
import { advancement, archiveScores, chooseFixture, parseForumPage, parsePost } from "./sync-awc-2026-forum.mjs";

const post = (text, author = "atomicworldchamp") => ({ text, author, time: Date.UTC(2026, 10, 7, 18) });

test("reads the original post, not a quoted result or the rendered page; checks pagination", () => {
  const html = `<title>2026 AWC Rounds and Results • page 18/20 • Atomic WC • lichess.org</title>
    <article class="forum-post" data-post-id="ABCDEFGH"><div class="forum-post__metas">
    <a class="author" href="/@/Alice">Alice</a><time datetime="2026-11-07T18:00:00Z"></time></div>
    <div class="forum-post__message-source">&gt; @Alice 2-6 @Bob
    &gt; https://lichess.org/11111111
    @Alice vs @Bob 6–2
    last game https://lichess.org/game/ABCDEFGH1234</div></article>`;
  const parsed = parseForumPage(html, 18);
  equal(parsed.lastPage, 20);
  const [report] = parsed.posts.flatMap(parsePost);
  deepEqual([report.type, report.author, report.s1, report.s2, report.gameIds], ["result", "alice", 6, 2, ["ABCDEFGH"]]);
  throws(() => parseForumPage(html, 19), /pagination/);
});

test("turns a director's multi-match UTC announcement into exact kickoffs, not proposals", () => {
  const reports = parsePost(post("Remaining fixtures tomorrow:\n@Alice vs. @Bob at 08 UTC\n@Carol vs @Dave at 19:30 UTC\n@Eve vs @Frank maybe 20 UTC"));
  deepEqual(reports.map(({ p1, at }) => [p1, new Date(at).toISOString()]), [
    ["alice", "2026-11-08T08:00:00.000Z"],
    ["carol", "2026-11-08T19:30:00.000Z"],
  ]);
  deepEqual(parsePost(post("@Alice vs @Bob Nov 8 at 08 UTC+2", "alice")), []);
  deepEqual(parsePost(post("@Alice vs @Bob Nov 8 at 08 UTC", "spectator")), []);
});

test("advances both players in bracket order without overwriting an occupied slot", () => {
  const first = { id: "wb-r1-m1", order: 1, p1: "alice", p2: "bob", winner_to: "wb-r2-m1", loser_to: "lb-r1-m1" };
  const second = { ...first, id: "wb-r1-m2", order: 2, p1: "carol", p2: "dave" };
  const winners = { id: "wb-r2-m1", p1: "", p2: "" };
  const losers = { id: "lb-r1-m1", p1: "", p2: "" };
  const rows = [second, losers, winners, first];
  equal(chooseFixture(rows, { p1: "bob", p2: "alice" }, Date.UTC(2026, 10, 7)), first);
  deepEqual(advancement(rows, first, 2, 6), [
    { id: winners.id, side: "p1", player: "bob" },
    { id: losers.id, side: "p1", player: "alice" },
  ]);
  winners.p1 = "eve";
  throws(() => advancement(rows, first, 2, 6), /Conflicting advancement slot/);
});

test("verifies archive score in archive-player order despite alternating colors", () => {
  deepEqual(archiveScores({ games: ["11111111,,2,2,3+2", "22222222,,2,1,3+2", "33333333,,0,1,3+2"] }), [1.5, 1.5]);
});
