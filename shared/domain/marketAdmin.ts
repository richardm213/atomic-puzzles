import { z } from "zod";

import type { MatchRow } from "./atomicTourAwards";

const marketId = z.string().trim().min(1).max(200);
const base = { marketId };
export const marketResolutionInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("binary"), outcome: z.enum(["yes", "no"]) }),
  z.object({ ...base, kind: z.literal("price"), referenceFillId: z.number().int().positive() }),
  z.object({ ...base, kind: z.literal("refund") }),
  z
    .object({
      ...base,
      kind: z.literal("match"),
      score1: z.number().min(0).max(1000).multipleOf(0.5),
      score2: z.number().min(0).max(1000).multipleOf(0.5),
      outcomeType: z.enum(["played", "withdrawal", "disqualification"]),
      playedOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(
          (date) =>
            Number.isFinite(new Date(date).valueOf()) &&
            new Date(date).toISOString().slice(0, 10) === date,
          "Enter a valid date",
        ),
      referenceFillId: z.number().int().positive().optional(),
      matchId: z.string().trim().max(100).default(""),
      allowUnlinked: z.boolean().default(false),
    })
    .refine((input) => input.score1 !== input.score2, "Enter a decisive match score"),
]);
export type MarketResolutionInput = z.infer<typeof marketResolutionInputSchema>;
export type Fixture = MatchRow & {
  winner_to: string | null;
  loser_to: string | null;
  [key: string]: unknown;
};
export type FixtureChange = { tournament: string; id: string; patch: Partial<Fixture> };
export type AdminMarket = {
  id: string;
  title: string;
  group: string;
  status: string;
  choices: { yes: string; no: string };
  fixture: Fixture | null;
};
export type ResolutionSummary = {
  marketTitles: string[];
  winner: string | null;
  score: string | null;
  playedOn: string | null;
  matchId: string | null;
  bracketChanges: { id: string; playerOne: string; playerTwo: string }[];
  pointChanges: { username: string; before: number; after: number }[];
  payouts: { username: string; amount: number }[];
  notificationCount: number;
  warnings: string[];
};
export type ResolutionPreview = {
  version: string;
  operationKey: string;
  summary: ResolutionSummary;
  archiveCandidates: { matchId: string; date: string; score: string }[];
};
export type ResolutionReceipt = {
  operationKey: string;
  summary: ResolutionSummary;
  completedAt: string;
};
const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
export const fixtureWinner = (fixture: MatchRow) =>
  fixture.s1 > fixture.s2
    ? normalize(fixture.p1)
    : fixture.s2 > fixture.s1
      ? normalize(fixture.p2)
      : "";

// Retain the established feeder order. Winners enter before main-bracket losers;
// within each path the original bracket order determines the target player slot.
export const tournamentResultChanges = (fixtures: Fixture[], updated: Fixture): FixtureChange[] => {
  const changes: FixtureChange[] = [];
  const winner = fixtureWinner(updated);
  if (!winner) throw new Error("A match needs a winner");
  const loser = winner === normalize(updated.p1) ? normalize(updated.p2) : normalize(updated.p1);
  const upperFinal = fixtures.find(
    (f) => f.bracket === "main" && /^(final|finals)$/i.test(f.round),
  );
  if (
    updated.bracket === "grand_final" &&
    updated.winner_to === updated.loser_to &&
    upperFinal &&
    fixtureWinner(upperFinal) === winner
  )
    return changes;
  for (const [path, player] of [
    ["winner_to", winner],
    ["loser_to", loser],
  ] as const) {
    const targetId = updated[path];
    if (!targetId) continue;
    const target = fixtures.find((f) => f.id === targetId);
    if (!target) throw new Error(`Missing bracket destination: ${targetId}`);
    const feeders = fixtures
      .flatMap((f) =>
        (["winner_to", "loser_to"] as const)
          .filter((p) => f[p] === targetId)
          .map((p) => ({ fixture: f, path: p })),
      )
      .sort(
        (a, b) =>
          Number(a.path === "loser_to") - Number(b.path === "loser_to") ||
          Number(a.fixture.bracket === "losers") - Number(b.fixture.bracket === "losers") ||
          a.fixture.order - b.fixture.order ||
          a.fixture.id.localeCompare(b.fixture.id),
      );
    const slot = feeders.findIndex((f) => f.fixture.id === updated.id && f.path === path);
    if (slot < 0 || slot > 1 || feeders.length > 2)
      throw new Error(`Ambiguous bracket destination: ${targetId}`);
    const key =
      normalize(target.p1) === player
        ? "p1"
        : normalize(target.p2) === player
          ? "p2"
          : updated.winner_to === updated.loser_to
            ? player === normalize(updated.p1)
              ? "p1"
              : "p2"
            : slot === 0
              ? "p1"
              : "p2";
    if (normalize(target[key]) !== player && (target.s1 || target.s2 || target.played_on))
      throw new Error(`The downstream match ${targetId} has already been played`);
    changes.push({ tournament: updated.tournament, id: targetId, patch: { [key]: player } });
  }
  return changes;
};
