import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchArchiveJson = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  appendArchiveParam: (params: URLSearchParams, key: string, value: unknown) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  },
  fetchArchiveJson,
}));

import { fetchMatchRowsFromArchive } from "./matches";

describe("fetchMatchRowsFromArchive", () => {
  beforeEach(() => {
    fetchArchiveJson.mockReset();
    fetchArchiveJson.mockResolvedValue({ rows: [], total: 0 });
  });

  it("maps a partial source filter to every enabled normalized source", async () => {
    await fetchMatchRowsFromArchive("blitz", { sourceFilters: { arena: false } }, { pageSize: 25 });

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.get("sources")).toBe("friend,lobby,swiss,chesscom,unknown");
  });

  it("sends an empty source list when every source is disabled", async () => {
    await fetchMatchRowsFromArchive(
      "bullet",
      {
        sourceFilters: {
          arena: false,
          friend: false,
          lobby: false,
          swiss: false,
          chesscom: false,
          unknown: false,
        },
      },
      { pageSize: 25 },
    );

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.has("sources")).toBe(true);
    expect(params.get("sources")).toBe("");
  });

  it("supports atomic960 archive reads even though the current match UI does not list that mode", async () => {
    await fetchMatchRowsFromArchive("atomic960", {}, { pageSize: 25 });

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.get("mode")).toBe("atomic960");
  });
});
