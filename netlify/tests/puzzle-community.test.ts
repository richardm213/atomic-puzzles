import { describe, expect, it } from "vitest";

import {
  addPuzzleAttemptStats,
  buildCommunityUserStats,
  buildProfileCommentRows,
  handler,
  isPublicCommunityReadAction,
  sortProfileCommentRecords,
  sumCommentKarma,
} from "../functions/puzzle-community";

describe("profile comment history", () => {
  it("adds attempt totals and whole-number solve rates to puzzle vote rows", () => {
    expect(
      addPuzzleAttemptStats(
        [
          { puzzle_id: 10, upvotes: 3, downvotes: 1, score: 2 },
          { puzzle_id: 20, upvotes: 1, downvotes: 0, score: 1 },
        ],
        [
          { username: "alice", puzzle_id: "10", puzzle_correct: true },
          { username: "bob", puzzle_id: "10", puzzle_correct: false },
          { username: "carol", puzzle_id: "10", puzzle_correct: true },
        ],
      ),
    ).toEqual([
      expect.objectContaining({ puzzle_id: 10, attempts: 3, solve_rate: 67 }),
      expect.objectContaining({ puzzle_id: 20, attempts: 0, solve_rate: null }),
    ]);
  });

  it("keeps public comment reads available without a valid login", () => {
    expect(isPublicCommunityReadAction("siteComments")).toBe(true);
    expect(isPublicCommunityReadAction("profileComments")).toBe(true);
    expect(isPublicCommunityReadAction("loadDiscussion")).toBe(true);
    expect(isPublicCommunityReadAction("puzzleRankings")).toBe(true);
    expect(isPublicCommunityReadAction("communityUsers")).toBe(true);
    expect(isPublicCommunityReadAction("comment")).toBe(false);
    expect(isPublicCommunityReadAction("commentVote")).toBe(false);
  });

  it("aggregates activity and omits users with no community participation", () => {
    expect(
      buildCommunityUserStats(
        [{ username: "Alice" }, { username: "quiet_user" }],
        [
          { username: "alice", vote: 1 },
          { username: "alice", vote: -1 },
          { username: "bob", vote: 1 },
        ],
        [{ username: "alice" }, { username: "alice" }, { username: "bob" }],
        [
          { username: "alice", vote: 1, comment: { username: "alice" } },
          { username: "bob", vote: -1, comment: [{ username: "alice" }] },
          { username: "alice", vote: 1, comment: { username: "bob" } },
        ],
      ),
    ).toEqual([
      {
        username: "alice",
        puzzles_upvoted: 1,
        puzzles_downvoted: 1,
        comment_karma: -1,
        comments_left: 2,
      },
      {
        username: "bob",
        puzzles_upvoted: 1,
        puzzles_downvoted: 0,
        comment_karma: 1,
        comments_left: 1,
      },
    ]);
  });

  it("calculates Reddit-style net comment karma", () => {
    expect(sumCommentKarma([{ vote: 1 }, { vote: 1 }, { vote: -1 }, { vote: 0 }])).toBe(1);
    expect(
      sumCommentKarma([
        { username: "alice", vote: 1, comment: { username: "alice" } },
        { username: "bob", vote: 1, comment: { username: "alice" } },
        { username: "carol", vote: -1, comment: { username: "alice" } },
      ]),
    ).toBe(0);
  });

  it("sorts top comments by net score and uses recency as the tie-breaker", () => {
    const comments = [
      {
        id: 1,
        target_type: "puzzle" as const,
        target_id: "10",
        target_context: "",
        body: "Older",
        created_at: "2026-01-01",
      },
      {
        id: 2,
        target_type: "profile" as const,
        target_id: "alice",
        target_context: "",
        body: "Top",
        created_at: "2026-01-02",
      },
      {
        id: 3,
        target_type: "match" as const,
        target_id: "match-3",
        target_context: "bullet",
        body: "Newest tie",
        created_at: "2026-01-03",
      },
    ];
    const counts = [
      { comment_id: 1, upvotes: 10, score: 2 },
      { comment_id: 2, upvotes: 8, score: 5 },
      { comment_id: 3, upvotes: 6, score: 2 },
    ];

    expect(sortProfileCommentRecords(comments, counts, "top").map((comment) => comment.id)).toEqual(
      [2, 3, 1],
    );
    expect(
      sortProfileCommentRecords(comments, counts, "recent").map((comment) => comment.id),
    ).toEqual([3, 2, 1]);
  });

  it("redacts comment bodies until the viewer has attempted the puzzle", () => {
    const comments = [
      {
        id: 1,
        puzzle_id: 10,
        username: "commenter",
        body: "Visible solution detail",
        created_at: "2026-01-01",
      },
      { id: 2, puzzle_id: 20, body: "Hidden solution detail", created_at: "2026-01-02" },
    ];

    const rows = buildProfileCommentRows(
      comments,
      [
        { comment_id: 1, upvotes: 4 },
        { comment_id: 2, upvotes: 7 },
      ],
      [{ puzzle_id: 10 }],
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: 1,
        username: "commenter",
        body: "Visible solution detail",
        upvotes: 4,
        content_hidden: false,
      }),
      expect.objectContaining({ id: 2, body: null, upvotes: 7, content_hidden: true }),
    ]);
  });
});

describe("puzzle-community function", () => {
  it("only accepts POST requests", async () => {
    const response = await handler({ httpMethod: "GET" });
    expect(response.statusCode).toBe(405);
  });

  it("rejects malformed requests", async () => {
    const response = await handler({ httpMethod: "POST", body: "{}" });
    expect(response.statusCode).toBe(400);
  });

  it("requires login for voting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "vote", puzzleId: 1, vote: 1 }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("requires login for commenting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "comment", puzzleId: 1, body: "Nice puzzle" }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("requires login for profile commenting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        action: "comment",
        targetType: "profile",
        targetId: "alice",
        body: "Great profile",
      }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a match discussion without its mode context", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        action: "loadDiscussion",
        targetType: "match",
        targetId: "match-123",
      }),
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires login for comment voting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "commentVote", puzzleId: 1, commentId: 2, vote: 1 }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects cross-site comment and vote mutations", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example", origin: "https://evil.example" },
      body: JSON.stringify({ action: "vote", puzzleId: 1, vote: 1 }),
    });

    expect(response.statusCode).toBe(403);
  });
});
