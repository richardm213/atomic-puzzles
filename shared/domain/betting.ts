export const MIN_BET_AMOUNT = 1;
export const AWC_NOT_TO_WIN_MARKET_ID = "awc2026-winner-no";

type MatchBettingMarket = {
  marketKind: "match" | "outright";
  playerOne: string;
  playerTwo: string;
};

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
