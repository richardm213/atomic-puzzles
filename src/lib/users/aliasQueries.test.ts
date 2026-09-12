import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { aliasesLookupQueryOptions } from "./aliasQueries";

const fetchArchiveJson = vi.hoisted(() => vi.fn());
vi.mock("../archive/client", () => ({ fetchArchiveJson }));

afterEach(() => vi.clearAllMocks());

describe("Turso alias lookup recovery", () => {
  it("retries a failed archive read and preserves Chess.com and shared-platform accounts", async () => {
    const client = new QueryClient();
    fetchArchiveJson.mockRejectedValueOnce(new Error("Archive query failed"));
    fetchArchiveJson.mockResolvedValueOnce([
      {
        alias: "grevozin",
        username: "wolfram_ep",
        banned: false,
        count_games: "c",
        openings: "{}",
      },
      {
        alias: "wolfram_ep",
        username: "wolfram_ep",
        banned: false,
        count_games: "y",
        openings: "{}",
      },
      { alias: "shared", username: "shared", banned: false, count_games: "o", openings: "{}" },
      {
        alias: "lichess_only",
        username: "lichess_only",
        banned: false,
        count_games: "y",
        openings: "{}",
      },
    ]);

    try {
      const lookup = await client.fetchQuery({
        ...aliasesLookupQueryOptions(),
        retry: 1,
        retryDelay: 0,
      });
      expect(fetchArchiveJson).toHaveBeenCalledTimes(2);
      expect(fetchArchiveJson.mock.calls[0]?.[0].get("resource")).toBe("aliases");
      expect(lookup.get("wolfram_ep")?.chessComAliases).toEqual(["grevozin"]);
      expect(lookup.get("grevozin")?.primary).toBe("wolfram_ep");
      expect(lookup.get("shared")?.chessComAliases).toEqual(["shared"]);
      expect(lookup.get("lichess_only")?.chessComAliases).toEqual([]);
    } finally {
      client.clear();
    }
  });
});
