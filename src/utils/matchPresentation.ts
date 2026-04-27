export const scoreToneClass = (
  score: number | string,
  opponentScore: number | string,
): string => {
  const numericScore = Number(score);
  const numericOpponentScore = Number(opponentScore);
  if (numericScore > numericOpponentScore) return " winner";
  if (numericScore < numericOpponentScore) return " loser";
  return "";
};
