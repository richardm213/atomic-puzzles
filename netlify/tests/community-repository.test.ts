import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../archive/client", () => ({
  getArchiveClient: () => ({ execute: mocks.execute }),
}));

import { CommunityRepository } from "../features/community/repository";

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
});
