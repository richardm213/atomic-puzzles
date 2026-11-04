import { describe, expect, it } from "vitest";

import type { TournamentBracketStage, TournamentMatch } from "../../lib/matches/tournaments";
import { buildRoundRobinGroups } from "./groupStage";

const match = (
  id: string,
  p1: string,
  p2: string,
  s1: number,
  s2: number,
  matchId = "linked",
): TournamentMatch => ({
  tournament: "a960e2026",
  bracket: "qualifying",
  round: "First Round",
  order: 1,
  id,
  match_id: matchId,
  played_on: "2026-05-07",
  p1,
  p2,
  s1,
  s2,
  winner_to: "",
  loser_to: "",
  outcome_type: "",
  replacement_player: "",
  replacement_for: "",
  replacement_note: "",
  replacement_history: [],
});

describe("round-robin group standings", () => {
  it("builds W-L-T records and excludes unplayed 0-0 matches from history", () => {
    const stage: TournamentBracketStage = {
      key: "qualifying",
      label: "Group Stage",
      rounds: [
        {
          roundName: "First Round",
          matches: [
            match("a960e2026-q-r1-a-1", "alpha", "beta", 3, 1),
            match("a960e2026-q-r1-a-2", "gamma", "delta", 2, 2),
          ],
        },
        {
          roundName: "Second Round",
          matches: [match("a960e2026-q-r2-a-1", "alpha", "gamma", 0, 0, "")],
        },
      ],
    };

    const [group] = buildRoundRobinGroups(stage);
    expect(group?.name).toBe("A");
    expect(group?.standings).toEqual([
      expect.objectContaining({ playerName: "alpha", wins: 1, losses: 0, ties: 0 }),
      expect.objectContaining({ playerName: "delta", wins: 0, losses: 0, ties: 1 }),
      expect.objectContaining({ playerName: "gamma", wins: 0, losses: 0, ties: 1 }),
      expect.objectContaining({ playerName: "beta", wins: 0, losses: 1, ties: 0 }),
    ]);
    expect(group?.standings.find(({ playerName }) => playerName === "alpha")?.history).toHaveLength(
      1,
    );
  });
});
