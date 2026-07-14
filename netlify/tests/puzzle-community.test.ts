import { describe, expect, it } from "vitest";

import {
  buildProfileCommentRows,
  handler,
  isPublicCommunityReadAction,
  sortProfileCommentRecords,
  sumCommentKarma,
} from "../functions/puzzle-community";

describe("profile comment history", () => {
  it("keeps public comment reads available without a valid login", () => {
    expect(isPublicCommunityReadAction("siteComments")).toBe(true);
    expect(isPublicCommunityReadAction("profileComments")).toBe(true);
    expect(isPublicCommunityReadAction("comment")).toBe(false);
    expect(isPublicCommunityReadAction("commentVote")).toBe(false);
  });

  it("calculates Reddit-style net comment karma", () => {
    expect(sumCommentKarma([{ vote: 1 }, { vote: 1 }, { vote: -1 }, { vote: 0 }])).toBe(1);
  });

  it("sorts top comments by net score and uses recency as the tie-breaker", () => {
    const comments = [
      { id: 1, puzzle_id: 10, body: "Older", created_at: "2026-01-01" },
      { id: 2, puzzle_id: 20, body: "Top", created_at: "2026-01-02" },
      { id: 3, puzzle_id: 30, body: "Newest tie", created_at: "2026-01-03" },
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

  it("requires login for comment voting", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "commentVote", puzzleId: 1, commentId: 2, vote: 1 }),
    });
    expect(response.statusCode).toBe(401);
  });
});
