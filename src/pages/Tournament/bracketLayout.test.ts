import type { TournamentBracketStage, TournamentMatch } from "../../lib/matches/tournaments";
import {
  buildStageTreeLayout,
  buildStartRoundState,
  getAwcCurrentRound,
  getStageRoundShortLabel,
  getStartRoundOptions,
  getVisibleRounds,
} from "./bracketLayout";

const match = (id: string, winnerTo = ""): TournamentMatch => ({
  tournament: "test",
  bracket: "main",
  round: "",
  order: 0,
  id,
  match_id: "",
  played_on: "",
  p1: "Player one",
  p2: "Player two",
  s1: 0,
  s2: 0,
  winner_to: winnerTo,
  loser_to: "",
  outcome_type: "",
  replacement_player: "",
  replacement_for: "",
  replacement_note: "",
  replacement_history: [],
});

const stage: TournamentBracketStage = {
  key: "main",
  label: "Main bracket",
  rounds: [
    {
      roundName: "Semifinals",
      matches: [match("semi-1", "final"), match("semi-2", "final")],
    },
    { roundName: "Finals", matches: [match("final")] },
    { roundName: "Grand Final", matches: [match("grand-final")] },
  ],
};

describe("bracket layout", () => {
  it("builds deterministic match positions and feeder connectors", () => {
    const layout = buildStageTreeLayout(stage, "Semifinals");

    expect(layout).not.toBeNull();
    const [top, bottom, final] = layout!.positionedMatches;
    expect([top?.id, bottom?.id, final?.id]).toEqual(["semi-1", "semi-2", "final"]);
    expect(top!.x).toBe(bottom!.x);
    expect(final!.x).toBeGreaterThan(top!.x);
    expect(final!.y).toBeGreaterThan(top!.y);
    expect(final!.y).toBeLessThan(bottom!.y);
    expect(layout!.connectors).toHaveLength(4);
  });

  it("starts at the requested round and hides non-starting finals", () => {
    expect(buildStageTreeLayout(stage, "Finals")?.rounds.map((round) => round.roundName)).toEqual([
      "Finals",
      "Grand Final",
    ]);
    expect(getStartRoundOptions(stage).map((round) => round.roundName)).toEqual([
      "Semifinals",
      "Finals",
    ]);
    expect(buildStartRoundState([stage], "Finals")).toEqual({ main: "Finals" });
  });

  it("follows the oldest unfinished AWC round even when a later match has been played", () => {
    const lastR16 = match("r16-last");
    const awc = {
      ...stage,
      rounds: [
        { roundName: "Round of 32", matches: [{ ...match("bye"), p2: "bye" }] },
        { roundName: "Round of 16", matches: [{ ...match("r16-first"), s1: 6 }, lastR16] },
        {
          roundName: "Quarterfinals",
          matches: [
            { ...match("qf-first"), s2: 6 },
            { ...match("qf-waiting"), p2: "" },
          ],
        },
      ],
    };
    expect(getAwcCurrentRound(awc)).toBe("Round of 16");
    lastR16.s2 = 6;
    expect(getAwcCurrentRound(awc)).toBe("Quarterfinals");
  });

  it("follows a grand final reset only if the losers-bracket finalist wins the first set", () => {
    const grandFinal = { ...match("grand-final"), s1: 6, s2: 4 };
    const awc = {
      ...stage,
      rounds: [
        { roundName: "Grand Final", matches: [grandFinal] },
        { roundName: "Grand Final Reset", matches: [match("reset")] },
      ],
    };
    expect(getAwcCurrentRound(awc)).toBe("Grand Final");
    grandFinal.s2 = 7;
    expect(getAwcCurrentRound(awc)).toBe("Grand Final Reset");
    expect(getStartRoundOptions(awc, "Grand Final Reset").map((round) => round.roundName)).toEqual([
      "Grand Final Reset",
    ]);
  });

  it("labels a single qualifying round Q1 instead of Q2", () => {
    const singleRoundQualifyingStage: TournamentBracketStage = {
      key: "qualifying",
      label: "Qualifying",
      rounds: [{ roundName: "Qualifying Round", matches: [match("qualifier-1")] }],
    };
    const twoRoundQualifyingStage: TournamentBracketStage = {
      ...singleRoundQualifyingStage,
      rounds: [
        { roundName: "First Round", matches: [match("qualifier-r1")] },
        { roundName: "Qualifying Round", matches: [match("qualifier-r2")] },
      ],
    };
    const threeRoundQualifyingStage: TournamentBracketStage = {
      ...singleRoundQualifyingStage,
      rounds: [
        { roundName: "First Round", matches: [match("qualifier-r1")] },
        { roundName: "Second Round", matches: [match("qualifier-r2")] },
        { roundName: "Qualifying Round", matches: [match("qualifier-r3")] },
      ],
    };

    expect(getStageRoundShortLabel(singleRoundQualifyingStage, "Qualifying Round")).toBe("Q1");
    expect(getStageRoundShortLabel(twoRoundQualifyingStage, "First Round")).toBe("Q1");
    expect(getStageRoundShortLabel(twoRoundQualifyingStage, "Qualifying Round")).toBe("Q2");
    expect(getStageRoundShortLabel(threeRoundQualifyingStage, "Qualifying Round")).toBe("Q3");
  });

  it("shows one round at a time for round-robin qualifying stages", () => {
    const roundRobinStage: TournamentBracketStage = {
      key: "qualifying",
      label: "Qualifying",
      rounds: [
        { roundName: "First Round", matches: [match("group-r1")] },
        { roundName: "Second Round", matches: [match("group-r2")] },
        { roundName: "Qualifying Round", matches: [match("group-r3")] },
      ],
    };
    const knockoutStage: TournamentBracketStage = {
      ...roundRobinStage,
      rounds: [
        {
          roundName: "First Round",
          matches: [match("knockout-r1", "knockout-r2")],
        },
        { roundName: "Qualifying Round", matches: [match("knockout-r2")] },
      ],
    };

    expect(
      getVisibleRounds(roundRobinStage, "Second Round").map((round) => round.roundName),
    ).toEqual(["Second Round"]);
    expect(getVisibleRounds(knockoutStage, "First Round").map((round) => round.roundName)).toEqual([
      "First Round",
      "Qualifying Round",
    ]);
  });

  it("preserves bye anchors across selectable starting rounds without drawing empty branches", () => {
    const byeStage: TournamentBracketStage = {
      key: "main",
      label: "Main bracket",
      rounds: [
        {
          roundName: "Round of 64",
          matches: [
            { ...match("r64-player", "r32-1"), p1: "Player one", p2: "bye" },
            { ...match("r64-empty", "r32-1"), p1: "bye", p2: "bye" },
            match("r64-3", "r32-2"),
            match("r64-4", "r32-2"),
          ],
        },
        {
          roundName: "Round of 32",
          matches: [
            { ...match("r32-1", "r16-1"), p1: "Player one", p2: "bye" },
            match("r32-2", "r16-1"),
          ],
        },
        { roundName: "Round of 16", matches: [match("r16-1")] },
      ],
    };

    const fromRoundOf64 = buildStageTreeLayout(byeStage, "Round of 64");
    const fromRoundOf32 = buildStageTreeLayout(byeStage, "Round of 32");
    const fromRoundOf16 = buildStageTreeLayout(byeStage, "Round of 16");

    expect(fromRoundOf64?.positionedMatches).toHaveLength(7);
    expect(fromRoundOf64?.connectors.some(({ key }) => key.includes("r64-empty"))).toBe(false);
    expect(fromRoundOf32?.positionedMatches.map(({ id }) => id)).toEqual([
      "r32-1",
      "r32-2",
      "r16-1",
    ]);
    expect(fromRoundOf16?.positionedMatches.map(({ id }) => id)).toEqual(["r16-1"]);
  });

  it("keeps sparse qualifier feeders in their destination slots", () => {
    const qualifierFinals = Array.from({ length: 8 }, (_, index) => ({
      ...match(`qualifier-final-${index + 1}`),
      bracket: "qualifying",
      round: "Qualifying Round",
      order: index + 1,
    }));
    const qualifierStage: TournamentBracketStage = {
      key: "qualifying",
      label: "Qualifying",
      rounds: [
        {
          roundName: "First Round",
          matches: [6, 7, 8].map((order) => ({
            ...match(`qualifier-r1-${order}`, `qualifier-final-${order}`),
            bracket: "qualifying",
            round: "First Round",
            order,
          })),
        },
        { roundName: "Qualifying Round", matches: qualifierFinals },
      ],
    };

    const layout = buildStageTreeLayout(qualifierStage, "First Round");
    const positions = new Map(layout?.positionedMatches.map(({ id, y }) => [id, y]));

    expect(positions.get("qualifier-r1-6")).toBe(positions.get("qualifier-final-6"));
    expect(positions.get("qualifier-r1-7")).toBe(positions.get("qualifier-final-7"));
    expect(positions.get("qualifier-r1-8")).toBe(positions.get("qualifier-final-8"));
    expect(positions.get("qualifier-final-5")).toBeLessThan(positions.get("qualifier-final-6")!);
  });

  it("orders historical losers-bracket rows by their advancement tree", () => {
    const losersMatch = (id: string, round: string, order: number, winnerTo = "") => ({
      ...match(id, winnerTo),
      bracket: "losers",
      round,
      order,
    });
    const losersStage: TournamentBracketStage = {
      key: "losers",
      label: "Losers Bracket",
      rounds: [
        {
          roundName: "Round 1",
          matches: [
            losersMatch("r1-a", "Round 1", 1, "r2-b"),
            losersMatch("r1-b", "Round 1", 2, "r2-d"),
            losersMatch("r1-c", "Round 1", 3, "r2-a"),
            losersMatch("r1-d", "Round 1", 4, "r2-c"),
          ],
        },
        {
          roundName: "Round 2",
          matches: [
            losersMatch("r2-a", "Round 2", 1, "r3-a"),
            losersMatch("r2-b", "Round 2", 2, "r3-b"),
            losersMatch("r2-c", "Round 2", 3, "r3-a"),
            losersMatch("r2-d", "Round 2", 4, "r3-b"),
          ],
        },
        {
          roundName: "Round 3",
          matches: [
            losersMatch("r3-a", "Round 3", 1, "final"),
            losersMatch("r3-b", "Round 3", 2, "final"),
          ],
        },
        { roundName: "Final", matches: [losersMatch("final", "Final", 1)] },
      ],
    };

    const layout = buildStageTreeLayout(losersStage, "Round 1");
    const roundOne = layout?.positionedMatches
      .filter(({ round }) => round === "Round 1")
      .sort((left, right) => left.y - right.y)
      .map(({ id }) => id);
    const roundThreeY = layout?.positionedMatches
      .filter(({ round }) => round === "Round 3")
      .map(({ y }) => y)
      .sort((left, right) => left - right);

    expect(roundOne).toEqual(["r1-c", "r1-d", "r1-a", "r1-b"]);
    expect(roundThreeY).toEqual([146, 402]);
  });
});
