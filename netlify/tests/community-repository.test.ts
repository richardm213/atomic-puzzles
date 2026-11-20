import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../archive/client", () => ({
  getArchiveClient: () => ({ execute: mocks.execute }),
}));

import { CommunityRepository } from "../features/community/repository";

it("edits only the comment matching the authenticated author and discussion", async () => {
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const filters = new URL(String(input)).searchParams;
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ body: "**new text**" });
    expect(filters.get("id")).toBe("eq.9");
    expect(filters.get("target_type")).toBe("eq.match");
    expect(filters.get("target_context")).toBe("eq.blitz");
    expect(filters.get("target_id")).toBe("in.(archive-match)");
    return Response.json(filters.get("username") === "eq.alice" ? [{ id: 9 }] : []);
  });
  const repository = new CommunityRepository(
    createClient("https://db.example", "test-key", { global: { fetch } }),
  );
  const target = { type: "match" as const, id: "archive-match", context: "blitz" };
  await expect(repository.updateOwnedComment(target, 9, "alice", "**new text**")).resolves.toBe(
    true,
  );
  await expect(repository.updateOwnedComment(target, 9, "bob", "**new text**")).resolves.toBe(
    false,
  );
});

describe("CommunityRepository archive identity resolution", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
  });

  it("resolves profile aliases through the Turso archive", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ username: "wolfram_ep" }] });
    const repository = new CommunityRepository({} as never);

    await expect(
      repository.resolveCanonicalTarget({ type: "profile", id: "grevozin", context: "" }),
    ).resolves.toEqual({ type: "profile", id: "wolfram_ep", context: "" });

    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ args: ["grevozin"] }));
  });

  it("does not query the archive for non-profile community targets", async () => {
    const repository = new CommunityRepository({} as never);
    const target = { type: "match" as const, id: "match-id", context: "blitz" };

    await expect(repository.resolveCanonicalTarget(target)).resolves.toEqual(target);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns the canonical profile and all aliases as one discussion identity", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [
        { alias: "Grevozin" },
        { alias: "drunk_ep" },
        { alias: "WOLFRAM_EP" },
        { alias: "grevozin" },
      ],
    });
    const repository = new CommunityRepository({} as never);

    await expect(repository.resolveProfileTargetIds("wolfram_ep")).resolves.toEqual([
      "wolfram_ep",
      "grevozin",
      "drunk_ep",
    ]);

    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ args: ["wolfram_ep"] }));
  });

  it("falls back to the canonical profile when alias lookup is unavailable", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("Archive unavailable"));
    const repository = new CommunityRepository({} as never);

    await expect(repository.resolveProfileTargetIds("Wolfram_EP")).resolves.toEqual(["wolfram_ep"]);
  });
});

it("limits puzzle notifications to recent initial attempts and retries, while deduplicating recipients", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
  const inserted: unknown[] = [];
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    if (init?.method === "POST") {
      inserted.push(...JSON.parse(String(init.body)));
      return Response.json([], { status: 201 });
    }
    if (url.pathname.endsWith("/puzzles")) return Response.json([{ author: "owner" }]);
    if (url.pathname.endsWith("/puzzle_progress")) {
      expect(params.get("first_attempt_at")).toBe("gte.2026-07-31T12:00:00.000Z");
      return Response.json([{ username: "recent" }, { username: "owner" }]);
    }
    if (url.pathname.endsWith("/puzzle_solver_states")) {
      expect(params.get("last_attempted_at")).toBe("gte.2026-07-31T12:00:00.000Z");
      return Response.json([{ username: "retry" }, { username: "actor" }]);
    }
    if (url.pathname.endsWith("/community_comments"))
      return Response.json([{ username: "follower" }, { username: "unregistered" }]);
    if (url.pathname.endsWith("/users"))
      return Response.json(
        ["owner", "recent", "retry", "follower"].map((username) => ({ username })),
      );
    if (url.pathname.endsWith("/notifications"))
      return Response.json([{ recipient_username: "recent", comment_id: 76 }]);
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  try {
    const repository = new CommunityRepository(
      createClient("https://db.example", "test-key", { global: { fetch } }),
    );
    await repository.notifyPuzzleCommentRecipients(42, 77, "actor", null);
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient_username: "owner",
          notification_type: "puzzle_author_comment",
        }),
        expect.objectContaining({
          recipient_username: "retry",
          notification_type: "puzzle_attempt_comment",
        }),
        expect.objectContaining({
          recipient_username: "follower",
          notification_type: "puzzle_comment",
        }),
      ]),
    );
    expect(inserted).toHaveLength(3);
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  {
    target: { type: "match" as const, id: "match-1", context: "blitz" },
    parentId: 9,
    type: "comment_reply",
    path: "/match/match-1#comment-77",
  },
  {
    target: { type: "profile" as const, id: "alice", context: "" },
    parentId: null,
    type: "profile_comment",
    path: "/@/alice#comment-77",
  },
])(
  "delivers $type to the discussion recipient with its actual destination",
  async ({ target, parentId, type, path }) => {
    const inserted: unknown[] = [];
    const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "POST") {
        inserted.push(JSON.parse(String(init.body)));
        return Response.json([], { status: 201 });
      }
      if (url.pathname.endsWith("/notifications")) return Response.json([]);
      return Response.json([{ username: "alice" }]);
    });
    const repository = new CommunityRepository(
      createClient("https://db.example", "test-key", { global: { fetch } }),
    );
    await repository.notifyDiscussionCommentRecipients(target, 77, "actor", parentId);
    expect(inserted).toEqual([
      expect.objectContaining({
        recipient_username: "alice",
        notification_type: type,
        puzzle_id: null,
        comment_id: 77,
        feature_path: path,
      }),
    ]);
  },
);

it.each(["puzzle", "endgame"] as const)(
  "deduplicates %s mentions by comment and any unread puzzle notice",
  async (type) => {
    const inserted: Array<{ recipient_username: string; feature_path: string }> = [];
    const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "POST") {
        inserted.push(...JSON.parse(String(init.body)));
        return Response.json([], { status: 201 });
      }
      if (url.pathname.endsWith("/users"))
        return Response.json([{ username: "alice" }, { username: "bob" }]);
      if (type === "puzzle") {
        expect(url.searchParams.get("or")).toBe(
          "(comment_id.eq.77,and(puzzle_id.eq.42,read_at.is.null))",
        );
      } else {
        expect(url.searchParams.get("comment_id")).toBe("eq.77");
      }
      return Response.json([{ recipient_username: "alice" }]);
    });
    const repository = new CommunityRepository(
      createClient("https://db.example", "test-key", { global: { fetch } }),
    );
    await repository.notifyMentionedUsers(
      { type, id: type === "puzzle" ? "42" : "queen-pawn-race", context: "" },
      77,
      "actor",
      "@alice @bob",
    );
    expect(inserted).toEqual([
      expect.objectContaining({
        recipient_username: "bob",
        feature_path: type === "puzzle" ? "/solve/42#comment-77" : "/puzzles/endgames#comment-77",
      }),
    ]);
  },
);
