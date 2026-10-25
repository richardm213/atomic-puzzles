export type AtomicTourEventTier = 2000 | 1000;

export type AtomicTourMainStage =
  | "entered"
  | "round-of-64"
  | "round-of-32"
  | "round-of-16"
  | "quarterfinal"
  | "semifinal"
  | "winners-final"
  | "final"
  | "champion";

const stagePercentages: Record<AtomicTourMainStage, number> = {
  entered: 0.01,
  "round-of-64": 0.02,
  "round-of-32": 0.05,
  "round-of-16": 0.09,
  quarterfinal: 0.18,
  semifinal: 0.36,
  "winners-final": 0.48,
  final: 0.6,
  champion: 1,
};

const stageOrder: AtomicTourMainStage[] = [
  "entered",
  "round-of-64",
  "round-of-32",
  "round-of-16",
  "quarterfinal",
  "semifinal",
  "winners-final",
  "final",
  "champion",
];

export type AtomicTourMainResult = {
  stage: AtomicTourMainStage;
  outcome: "win" | "loss" | "bye";
};

export const atomicTourStageForRound = (
  round: string,
  hasChampionshipMatch = false,
): AtomicTourMainStage => {
  const normalized = round.trim().toLowerCase();
  if (normalized.includes("grand final")) return "final";
  if (normalized === "finals" || normalized === "final")
    return hasChampionshipMatch ? "winners-final" : "final";
  if (normalized.includes("semifinal")) return "semifinal";
  if (normalized.includes("quarterfinal")) return "quarterfinal";
  if (normalized.includes("round of 16")) return "round-of-16";
  if (normalized.includes("round of 32")) return "round-of-32";
  if (normalized.includes("round of 64")) return "round-of-64";
  return "entered";
};

export const atomicTourStageForFinalRank = (rank: number): AtomicTourMainStage | null => {
  if (!Number.isInteger(rank) || rank < 1) return null;
  if (rank === 1) return "champion";
  if (rank === 2) return "final";
  if (rank <= 4) return "semifinal";
  if (rank <= 8) return "quarterfinal";
  if (rank <= 16) return "round-of-16";
  if (rank <= 32) return "round-of-32";
  return "round-of-64";
};

export const atomicTourPlacementAfterChampionship = (
  earnedStage: AtomicTourMainStage | null,
  championshipOutcome?: "win" | "loss",
): AtomicTourMainStage | null => {
  if (championshipOutcome === "win") return "champion";
  if (championshipOutcome === "loss") return "final";
  return earnedStage;
};

export const atomicTourMainStageForResults = (
  eventFirstStage: AtomicTourMainStage,
  results: AtomicTourMainResult[],
): AtomicTourMainStage | null => {
  const orderedResults = [...results].sort(
    (left, right) => stageOrder.indexOf(left.stage) - stageOrder.indexOf(right.stage),
  );
  const decidedResults = orderedResults.filter(({ outcome }) => outcome !== "bye");
  const firstDecision = decidedResults[0];
  if (!firstDecision) return null;

  const firstDecisionIndex = stageOrder.indexOf(firstDecision.stage);
  const enteredViaBye = orderedResults.some(
    ({ stage, outcome }) => outcome === "bye" && stageOrder.indexOf(stage) < firstDecisionIndex,
  );
  if (enteredViaBye && firstDecision.outcome === "loss") return eventFirstStage;

  return decidedResults.reduce((bestStage, result) => {
    const resultStageIndex = stageOrder.indexOf(result.stage);
    const earnedStage =
      result.outcome === "win"
        ? stageOrder[Math.min(resultStageIndex + 1, stageOrder.length - 1)]!
        : result.stage;
    return stageOrder.indexOf(earnedStage) > stageOrder.indexOf(bestStage)
      ? earnedStage
      : bestStage;
  }, eventFirstStage);
};

const losersWinPercentages = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16] as const;

export const atomicTourLosersBracketRoundCount = losersWinPercentages.length;

const losersBracketStartOffsets: Partial<Record<AtomicTourMainStage, number>> = {
  entered: 0,
  "round-of-64": 0,
  "round-of-32": 2,
  "round-of-16": 4,
  quarterfinal: 6,
  semifinal: 8,
  "winners-final": 9,
  final: 9,
  champion: 9,
};

export const atomicTourLosersBracketRoundCountForStart = (
  startStage: AtomicTourMainStage,
): number => atomicTourLosersBracketRoundCount - (losersBracketStartOffsets[startStage] ?? 0);

export const atomicTourEventPoints: Readonly<Record<string, AtomicTourEventTier>> = {
  awc: 2000,
  ccac: 2000,
  ahc: 1000,
  aoc: 1000,
  wolfarena: 1000,
};

export const atomicTourStagePoints = (
  tier: AtomicTourEventTier,
  stage: AtomicTourMainStage,
): number => Math.round(tier * stagePercentages[stage]);

export const atomicTourLosersBracketWinPoints = (
  tier: AtomicTourEventTier,
  roundIndex: number,
  startStage: AtomicTourMainStage = "round-of-64",
): number => {
  const adjustedRoundIndex = roundIndex + (losersBracketStartOffsets[startStage] ?? 0);
  const percentage =
    losersWinPercentages[
      Math.min(Math.max(0, adjustedRoundIndex), losersWinPercentages.length - 1)
    ]!;
  return Math.round(tier * percentage);
};

export const calculateKnockoutTourPoints = ({
  tier,
  mainStage,
  losersBracketWinRounds = [],
  losersBracketStartStage = "round-of-64",
}: {
  tier: AtomicTourEventTier;
  mainStage: AtomicTourMainStage;
  losersBracketWinRounds?: number[];
  losersBracketStartStage?: AtomicTourMainStage;
}): { basePoints: number; bonusPoints: number; totalPoints: number } => {
  const basePoints = atomicTourStagePoints(tier, mainStage);
  if (losersBracketWinRounds.length === 0) {
    return { basePoints, bonusPoints: 0, totalPoints: basePoints };
  }

  const requestedBonus = losersBracketWinRounds
    .map((roundIndex) =>
      atomicTourLosersBracketWinPoints(tier, roundIndex, losersBracketStartStage),
    )
    .reduce((sum, points) => sum + points, 0);
  const bonusCeiling =
    mainStage === "champion"
      ? Math.round(tier * 0.1)
      : Math.min(
          atomicTourStagePoints(tier, stageOrder[stageOrder.indexOf(mainStage) + 1]!) -
            basePoints -
            1,
          Math.round(tier * 0.2),
        );
  const bonusPoints = Math.max(0, Math.min(requestedBonus, bonusCeiling));

  return { basePoints, bonusPoints, totalPoints: basePoints + bonusPoints };
};

export const atomicChessLeagueTourPoints = (
  division: "elite" | "challenger",
  result: "win" | "draw" | "loss",
): number => {
  if (result === "loss") return 0;
  const winPoints = division === "elite" ? 100 : 50;
  return result === "draw" ? winPoints / 2 : winPoints;
};
