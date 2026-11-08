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
