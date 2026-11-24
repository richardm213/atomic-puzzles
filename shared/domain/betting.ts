export const MIN_BET_AMOUNT = 1;
export const MAX_PREDICTION_ORDER_QUANTITY = 100_000;

export const predictionOutcomes = ["yes", "no"] as const;
export type PredictionOutcome = (typeof predictionOutcomes)[number];
export type PredictionOrderSide = "buy" | "sell";
export type PredictionBookLevel = { priceCents: number; quantity: number };

const awcRoundTitles: Readonly<Record<string, string>> = {
  "awc-2026-round-of-16": "AWC Round of 16",
  "awc-2026-quarterfinals": "AWC Quarterfinals",
  "awc-2026-semifinals": "AWC Semifinals",
  "awc-2026-finals": "AWC Finals",
  "awc-2026-losers-round-1": "AWC Losers Round 1",
  "awc-2026-losers-round-2": "AWC Losers Round 2",
  "awc-2026-losers-round-3": "AWC Losers Round 3",
};

export const awcBettingRoundTitle = (groupId: string | null): string | undefined =>
  awcRoundTitles[groupId ?? ""];

type PredictionOrderDirection = {
  outcome: PredictionOutcome;
  side: PredictionOrderSide;
};

type TournamentOpponentMatch = {
  p1: string;
  p2: string;
  s1: number;
  s2: number;
  matchId?: string | null;
};

export type PredictionOrderRestriction = "self" | "opponent";

const normalizePlayer = (player: string): string => player.trim().toLowerCase();

export const isPredictionOrderAgainstOutcome = ({
  outcome,
  side,
}: PredictionOrderDirection): boolean =>
  (outcome === "no" && side === "buy") || (outcome === "yes" && side === "sell");

export const findCurrentTournamentOpponent = (
  matches: TournamentOpponentMatch[],
  username: string,
): string | null => {
  const normalizedUsername = normalizePlayer(username);
  const currentMatch = matches.find((match) => {
    const playerOne = normalizePlayer(match.p1);
    const playerTwo = normalizePlayer(match.p2);
    const hasBothPlayers =
      playerOne !== "" && playerTwo !== "" && playerOne !== "bye" && playerTwo !== "bye";
    const isUnplayed = !match.matchId && match.s1 === 0 && match.s2 === 0;
    return (
      hasBothPlayers &&
      isUnplayed &&
      (playerOne === normalizedUsername || playerTwo === normalizedUsername)
    );
  });
  if (!currentMatch) return null;
  return normalizePlayer(currentMatch.p1) === normalizedUsername
    ? currentMatch.p2
    : currentMatch.p1;
};

export const isRestrictedAwcChampionOrder = ({
  groupId,
  marketPlayer,
  username,
  currentOpponent,
  outcome,
  side,
}: PredictionOrderDirection & {
  groupId: string | null | undefined;
  marketPlayer: string | null | undefined;
  username: string;
  currentOpponent?: string | null;
}): PredictionOrderRestriction | null => {
  if (groupId !== "awc-2026-champion" || !isPredictionOrderAgainstOutcome({ outcome, side })) {
    return null;
  }
  const normalizedMarketPlayer = normalizePlayer(marketPlayer ?? "");
  if (normalizedMarketPlayer === normalizePlayer(username)) return "self";
  if (currentOpponent && normalizedMarketPlayer === normalizePlayer(currentOpponent)) {
    return "opponent";
  }
  return null;
};

export const isRestrictedAwcRoundOf16Order = ({
  groupId,
  yesPlayer,
  noPlayer,
  username,
  outcome,
  side,
}: PredictionOrderDirection & {
  groupId: string | null | undefined;
  yesPlayer: string | null | undefined;
  noPlayer: string | null | undefined;
  username: string;
}): PredictionOrderRestriction | null => {
  if (groupId !== "awc-2026-round-of-16" || side !== "buy") return null;
  const user = normalizePlayer(username);
  if (user === normalizePlayer(yesPlayer ?? "") && outcome === "no") return "opponent";
  if (user === normalizePlayer(noPlayer ?? "") && outcome === "yes") return "opponent";
  return null;
};

export const isRestrictedPredictionOrder = (
  input: Parameters<typeof isRestrictedAwcChampionOrder>[0] & {
    yesPlayer?: string | null | undefined;
    noPlayer?: string | null | undefined;
  },
): PredictionOrderRestriction | null =>
  isRestrictedAwcChampionOrder(input) ??
  isRestrictedAwcRoundOf16Order({
    groupId: input.groupId,
    yesPlayer: input.yesPlayer,
    noPlayer: input.noPlayer,
    username: input.username,
    outcome: input.outcome,
    side: input.side,
  });

export const predictionOrderRestrictionMessage = (
  restriction: PredictionOrderRestriction,
  groupId?: string | null,
): string =>
  restriction === "self"
    ? "You can’t bet against yourself in the AWC champion market."
    : groupId === "awc-2026-round-of-16"
      ? "You can only bet on yourself in your AWC Round of 16 market."
      : "You can’t bet against your current AWC opponent.";

export const awcChampionOutcomeRestrictions = (
  input: Omit<Parameters<typeof isRestrictedAwcChampionOrder>[0], "outcome">,
): Partial<Record<PredictionOrderDirection["outcome"], string>> => {
  const restrictions: Partial<Record<PredictionOrderDirection["outcome"], string>> = {};
  for (const outcome of ["yes", "no"] as const) {
    const restriction = isRestrictedAwcChampionOrder({ ...input, outcome });
    if (restriction) restrictions[outcome] = predictionOrderRestrictionMessage(restriction);
  }
  return restrictions;
};
