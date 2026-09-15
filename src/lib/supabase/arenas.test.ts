import { describe, expect, it, vi } from "vitest";

import { type Arena, arenaHref, filterArenas, getArenas } from "./arenas";

const { range, from } = vi.hoisted(() => {
  const range = vi.fn();
  const chain = { select: vi.fn(), order: vi.fn(), range };
  chain.select.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return { range, from: vi.fn(() => chain) };
});
vi.mock("./client", () => ({ getSupabaseClient: () => ({ from }) }));

const arena: Arena = {
  arena_id: "JKxPyDUa",
  name: "Monthly Atomic Arena",
  frequency: "monthly",
  starts_at: "2026-09-05T19:00:00+00:00",
  url: "https://lichess.org/tournament/JKxPyDUa",
  winner: "k1ll-shot",
  score: 195,
  players: 364,
};

describe("arena archive", () => {
  it("filters frequency and case-insensitive winner/name search", () => {
    expect(filterArenas([arena], "monthly", " K1LL ")).toEqual([arena]);
    expect(filterArenas([arena], "all", "Atomic")).toEqual([arena]);
    expect(filterArenas([arena], "shield", "")).toEqual([]);
    expect(filterArenas([arena], "all", "nobody")).toEqual([]);
  });
  it("keeps links on Lichess", () => {
    expect(arenaHref(arena)).toBe(arena.url);
    expect(arenaHref({ ...arena, url: "javascript:alert(1)" })).toBe(arena.url);
    expect(arenaHref({ ...arena, url: "https://example.com/tournament/JKxPyDUa" })).toBe(arena.url);
  });
  it("reads beyond the first page", async () => {
    range
      .mockResolvedValueOnce({ data: Array(500).fill(arena), error: null })
      .mockResolvedValueOnce({ data: [arena], error: null });
    expect(await getArenas()).toHaveLength(501);
    expect(range).toHaveBeenCalledWith(0, 499);
    expect(range).toHaveBeenCalledWith(500, 999);
    expect(from).toHaveBeenCalledWith("lichess_atomic_arenas");
  });
  it("reports database failures", async () => {
    range.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(getArenas()).rejects.toThrow("Unable to load");
  });
});
