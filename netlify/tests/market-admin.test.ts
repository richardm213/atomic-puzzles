import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type Fixture,
  fixtureWinner,
  tournamentResultChanges,
} from "../../shared/domain/marketAdmin";
import { archiveMatchesScore } from "../features/marketAdmin/archive";
import { MarketAdminRepository } from "../features/marketAdmin/repository";
import { MarketAdminService } from "../features/marketAdmin/service";
import { handler } from "../functions/market-admin";
import { createSiteSessionCookie } from "../lib/siteSession";

const fixture = (id: string, patch: Partial<Fixture> = {}): Fixture => ({
  tournament: "awc2026",
  id,
  bracket: "main",
  round: "Semifinals",
  order: 1,
  p1: "alpha",
  p2: "beta",
  s1: 0,
  s2: 0,
  played_on: null,
  match_id: null,
  winner_to: "",
  loser_to: "",
  ...patch,
});

describe("market administration boundaries", () => {
  beforeEach(() =>
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    ),
  );
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects non-admin and cross-site requests before any database access", async () => {
    const apply = vi.spyOn(MarketAdminRepository.prototype, "apply");
    for (const [username, origin] of [
      ["ordinary_player", "https://atomicpuzzles.org"],
      ["seaside_tiramisu", "https://evil.example"],
    ]) {
      const result = await handler({
        httpMethod: "POST",
        headers: {
          cookie: createSiteSessionCookie(username!, {}).split(";")[0],
          origin,
          host: "atomicpuzzles.org",
        },
        body: JSON.stringify({
          action: "resolve",
          input: { kind: "binary", marketId: "strike", outcome: "yes" },
          version: "a".repeat(64),
        }),
      });
      expect(result.statusCode).toBe(403);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects a stale preview and returns a completed receipt on retries", async () => {
    const repository = { receipt: vi.fn().mockResolvedValue(null), apply: vi.fn() };
    const service = new MarketAdminService(
      repository as unknown as MarketAdminRepository,
      "seaside_tiramisu",
    );
    const prepare = vi
      .spyOn(service, "prepare")
      .mockResolvedValue({ version: "b".repeat(64) } as never);
    const input = { kind: "binary", marketId: "strike", outcome: "yes" } as const;
    await expect(service.resolve(input, "a".repeat(64))).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.apply).not.toHaveBeenCalled();
    const receipt = { operationKey: "saved", summary: {}, completedAt: "2026-11-15" };
    repository.receipt.mockResolvedValue(receipt);
    prepare.mockClear();
    await expect(service.resolve(input, "a".repeat(64))).resolves.toEqual(receipt);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("feeds both bracket paths and refuses to overwrite a played downstream match", () => {
    const source = fixture("semi", { s1: 5.5, s2: 3.5, winner_to: "final", loser_to: "lower" });
    const other = fixture("other", { order: 2, winner_to: "final" });
    const lowerSource = fixture("lower-source", { bracket: "losers", winner_to: "lower" });
    const rows = [
      source,
      other,
      lowerSource,
      fixture("final"),
      fixture("lower", { p1: "gamma", p2: "" }),
    ];
    expect(tournamentResultChanges(rows, source)).toEqual([
      { tournament: "awc2026", id: "final", patch: { p1: "alpha" } },
      { tournament: "awc2026", id: "lower", patch: { p2: "beta" } },
    ]);
    expect(() =>
      tournamentResultChanges(
        rows.map((f) => (f.id === "lower" ? { ...f, s1: 6 } : f)),
        source,
      ),
    ).toThrow(/already been played/);
  });

  it("opens a grand-final reset only if needed and keeps the players in their original slots", () => {
    const upper = fixture("upper", { round: "Finals", s1: 6, s2: 2 });
    const grand = fixture("grand", {
      bracket: "grand_final",
      round: "Set 1",
      s1: 6,
      s2: 2,
      winner_to: "reset",
      loser_to: "reset",
    });
    const rows = [
      upper,
      grand,
      fixture("reset", { bracket: "grand_final", round: "Reset", p1: "", p2: "" }),
    ];
    expect(tournamentResultChanges(rows, grand)).toEqual([]);
    const lowerWins = { ...grand, s1: 2, s2: 6 };
    expect(fixtureWinner(lowerWins)).toBe("beta");
    expect(tournamentResultChanges(rows, lowerWins)).toEqual([
      { tournament: "awc2026", id: "reset", patch: { p2: "beta" } },
      { tournament: "awc2026", id: "reset", patch: { p1: "alpha" } },
    ]);
  });

  it("matches archive scores with reversed players, draws, and draw-odds finishes", () => {
    const row = {
      match_id: "firstgame",
      player_1: "beta",
      player_2: "alpha",
      start_ts: 0,
      mode: "blitz",
      games: ["game1,,2,1", "game2,,0,2"],
    };
    expect(archiveMatchesScore(row, fixture("semi", { s1: 1.5, s2: 0.5 }))).toBe(true);
    expect(archiveMatchesScore(row, fixture("semi", { s1: 2, s2: 0 }))).toBe(false);
    expect(
      archiveMatchesScore(
        { ...row, games: ["g1,,2,1", "g2,,1,2", "g3,,0,1"] },
        fixture("semi", { s1: 2, s2: 1 }),
      ),
    ).toBe(true);
  });
});
