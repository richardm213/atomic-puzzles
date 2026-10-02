import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../archive/client", () => ({
  getArchiveClient: () => ({ execute: mocks.execute }),
}));

import { resolveCanonicalArchiveUsername } from "../archive/aliases";

describe("canonical archive usernames", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
  });

  it("resolves a counted Lichess alias to its main user", async () => {
    mocks.execute.mockResolvedValue({
      rows: [{ username: "gannet", count_games: "y" }],
    });

    await expect(resolveCanonicalArchiveUsername(" Xeransis ")).resolves.toBe("gannet");
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ args: ["xeransis"] }));
  });

  it.each(["n", "c"])("keeps a %s account separate", async (countGames) => {
    mocks.execute.mockResolvedValue({
      rows: [{ username: "main_player", count_games: countGames }],
    });

    await expect(resolveCanonicalArchiveUsername("Separate_Account")).resolves.toBe(
      "separate_account",
    );
  });
});
