import { describe, expect, it } from "vitest";

import { parseExplorerRequest, PLAYER_MIN_RATING } from "../core/requestSchema.js";

const FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";
const parse = (values: Record<string, string>, path = "/api/opening-explorer") =>
  parseExplorerRequest(path, new URLSearchParams(values));

describe("parseExplorerRequest", () => {
  it("normalizes a player request and clamps its database rating range", () => {
    const result = parse({
      fen: `  ${FEN}  `,
      username: " Alice_1 ",
      opponent: " BOB-2 ",
      color: "black",
      minRating: "9999",
      speeds: "2,0,2",
      startDate: "2025-01",
      endDate: "2025-03",
    });

    expect(result).toMatchObject({
      ok: true,
      request: {
        kind: "explorer",
        fen: FEN,
        requestedUsername: "alice_1",
        requestedOpponent: "bob-2",
        requestedColor: 1,
        playerMinRating: 2200,
        speeds: [0, 2],
      },
    });
  });

  it("ignores minimum rating for general queries and uses the player floor for invalid values", () => {
    expect(parse({ fen: FEN, minRating: "1800" })).toMatchObject({
      ok: true,
      request: { playerMinRating: null },
    });
    expect(parse({ fen: FEN, username: "alice", minRating: "nope" })).toMatchObject({
      ok: true,
      request: { playerMinRating: PLAYER_MIN_RATING },
    });
  });

  it.each([
    [{}, "Missing fen query parameter"],
    [{ fen: "invalid" }, "Invalid fen query parameter"],
    [{ fen: FEN, username: "not valid!" }, "Invalid username query parameter"],
    [{ fen: FEN, color: "green" }, "Invalid color query parameter"],
    [{ fen: FEN, speeds: "0,9" }, "Invalid speeds query parameter"],
    [{ fen: FEN, startDate: "2025-13" }, "Invalid month filter query parameter"],
    [{ fen: FEN, extra: "1" }, "Unexpected query parameter: extra"],
  ])("rejects malformed explorer input %#", (values, error) => {
    expect(parse(values)).toEqual({ ok: false, error });
  });

  it("recognizes health and player-list routes without requiring a FEN", () => {
    expect(parse({}, "/api/opening-explorer/health")).toEqual({
      ok: true,
      request: { kind: "health" },
    });
    expect(parse({}, "/api/opening-players")).toEqual({
      ok: true,
      request: { kind: "players" },
    });
  });
});
