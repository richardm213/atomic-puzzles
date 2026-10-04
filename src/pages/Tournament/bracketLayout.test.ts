import type { TournamentBracketStage, TournamentMatch } from "../../lib/matches/tournaments";
import {
  buildStageTreeLayout,
  buildStartRoundState,
  clampZoom,
  getRoundShortLabel,
  getStartRoundOptions,
  zoomDisplayPercent,
} from "./bracketLayout";

const match = (id: string, winnerTo = ""): TournamentMatch => ({
  tournament: "test",
  bracket: "main",
  round: "",
  order: 0,
  id,
  match_id: "",
  p1: "Player one",
  p2: "Player two",
  s1: 0,
  s2: 0,
  winner_to: winnerTo,
  loser_to: "",
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

    expect(layout?.positionedMatches.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: "semi-1", x: 18, y: 82 },
      { id: "semi-2", x: 18, y: 210 },
      { id: "final", x: 356, y: 146 },
      { id: "grand-final", x: 694, y: 82 },
    ]);
    expect(layout?.connectors).toHaveLength(4);
    expect(layout?.width).toBe(972);
    expect(layout?.height).toBe(316);
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

  it("normalizes labels and zoom values", () => {
    expect(getRoundShortLabel("Round of 32")).toBe("R32");
    expect(getRoundShortLabel("Round 7")).toBe("R7");
    expect(clampZoom(99)).toBe(1.35);
    expect(clampZoom(0)).toBe(0.85);
    expect(zoomDisplayPercent(0.85)).toBe(100);
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
});
