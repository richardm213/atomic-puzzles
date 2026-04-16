export const scoreToneClass = (score, opponentScore) => {
  const numericScore = Number(score);
  const numericOpponentScore = Number(opponentScore);
  if (numericScore > numericOpponentScore) return " winner";
  if (numericScore < numericOpponentScore) return " loser";
  return "";
};
