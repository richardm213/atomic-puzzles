import { describe, expect, it } from "vitest";

import {
  buildLichessGameUrl,
  buildMatchRouteParams,
  buildSingleGameMatchUrl,
  hasMatchRouteParams,
  isSingleGameMatch,
  normalizeMatchMode,
} from "./matchRoutes";

describe("normalizeMatchMode", () => {
  it("returns the mode unchanged when valid", () => {
    expect(normalizeMatchMode("blitz")).toBe("blitz");
    expect(normalizeMatchMode("BULLET")).toBe("bullet");
    expect(normalizeMatchMode("Hyperbullet")).toBe("hyperbullet");
  });

  it("returns '' for unknown modes", () => {
    expect(normalizeMatchMode("classical")).toBe("");
    expect(normalizeMatchMode("")).toBe("");
    expect(normalizeMatchMode(null)).toBe("");
  });
});

describe("buildMatchRouteParams", () => {
  it("normalizes mode and stringifies matchId", () => {
    expect(buildMatchRouteParams({ mode: "blitz", matchId: "abc123" })).toEqual({
      mode: "blitz",
      matchId: "abc123",
    });
  });

  it("returns blanks when fields are missing", () => {
    expect(buildMatchRouteParams({})).toEqual({ mode: "", matchId: "" });
    expect(buildMatchRouteParams(null)).toEqual({ mode: "", matchId: "" });
  });
});

describe("hasMatchRouteParams", () => {
  it("returns true only when both mode and matchId are present", () => {
    expect(hasMatchRouteParams({ mode: "blitz", matchId: "abc" })).toBe(true);
    expect(hasMatchRouteParams({ mode: "blitz", matchId: " " })).toBe(false);
    expect(hasMatchRouteParams({ mode: "", matchId: "abc" })).toBe(false);
    expect(hasMatchRouteParams(null)).toBe(false);
  });
});

describe("isSingleGameMatch", () => {
  it("returns true for exactly one game", () => {
    expect(isSingleGameMatch({ games: [{ id: "abc" }] })).toBe(true);
    expect(isSingleGameMatch({ gameCount: 1 })).toBe(true);
  });

  it("returns false for missing, empty, or multi-game matches", () => {
    expect(isSingleGameMatch({ games: [] })).toBe(false);
    expect(isSingleGameMatch({ games: [{ id: "abc" }, { id: "def" }], gameCount: 1 })).toBe(
      false,
    );
    expect(isSingleGameMatch({ gameCount: 2 })).toBe(false);
    expect(isSingleGameMatch(null)).toBe(false);
  });
});

describe("buildLichessGameUrl", () => {
  it("returns a lichess URL for a game id", () => {
    expect(buildLichessGameUrl("abc 123")).toBe("https://lichess.org/abc%20123");
  });

  it("returns an empty string when the game id is missing", () => {
    expect(buildLichessGameUrl("—")).toBe("");
    expect(buildLichessGameUrl(null)).toBe("");
  });
});

describe("buildSingleGameMatchUrl", () => {
  it("uses the first game id for one-game matches", () => {
    expect(
      buildSingleGameMatchUrl({
        mode: "blitz",
        matchId: "match-id",
        firstGameId: "game-id",
        gameCount: 1,
      }),
    ).toBe("https://lichess.org/game-id");
  });

  it("falls back to the games array and match id", () => {
    expect(buildSingleGameMatchUrl({ firstGameId: "—", games: [{ id: "array-game" }] })).toBe(
      "https://lichess.org/array-game",
    );
    expect(buildSingleGameMatchUrl({ matchId: "match-game", gameCount: 1 })).toBe(
      "https://lichess.org/match-game",
    );
  });

  it("does not build a lichess URL for longer matches", () => {
    expect(
      buildSingleGameMatchUrl({
        matchId: "match-id",
        firstGameId: "game-id",
        gameCount: 2,
      }),
    ).toBe("");
  });
});
