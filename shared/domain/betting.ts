export const MIN_BET_AMOUNT = 1;
export const AWC_NOT_TO_WIN_MARKET_ID = "awc2026-winner-no";

type MatchBettingMarket = {
  marketKind: "match" | "outright";
  playerOne: string;
  playerTwo: string;
};

type PredictionOrderDirection = {
  outcome: "yes" | "no";
  side: "buy" | "sell";
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

export const isAwcNotToWinSelfBet = (
  marketId: string,
  username: string,
  selection: string,
): boolean =>
  /^awc\d{4}-winner-no$/.test(marketId) && normalizePlayer(username) === normalizePlayer(selection);

export const isTournamentBetOnOpponent = (
  market: MatchBettingMarket,
  username: string,
  selection: string,
): boolean => {
  if (market.marketKind !== "match") return false;

  const user = normalizePlayer(username);
  const selectedPlayer = normalizePlayer(selection);
  const playerOne = normalizePlayer(market.playerOne);
  const playerTwo = normalizePlayer(market.playerTwo);

  if (user === playerOne) return selectedPlayer === playerTwo;
  if (user === playerTwo) return selectedPlayer === playerOne;
  return false;
};

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

export const predictionOrderRestrictionMessage = (
  restriction: PredictionOrderRestriction,
): string =>
  restriction === "self"
    ? "You can’t bet against yourself in the AWC champion market."
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
