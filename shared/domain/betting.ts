export const MIN_BET_AMOUNT = 1;

type MatchBettingMarket = {
  marketKind: "match" | "outright";
  playerOne: string;
  playerTwo: string;
};

const normalizePlayer = (player: string): string => player.trim().toLowerCase();

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
