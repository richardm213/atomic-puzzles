const matchSlugSeparator = "-vs-";

export const matchupToSlug = (player1, player2) =>
  `${encodeURIComponent(player1)}${matchSlugSeparator}${encodeURIComponent(player2)}`;

export const parseMatchupSlug = (matchup) => {
  const separatorIndex = String(matchup || "").indexOf(matchSlugSeparator);
  if (separatorIndex <= 0) return null;
  const player1Part = matchup.slice(0, separatorIndex);
  const player2Part = matchup.slice(separatorIndex + matchSlugSeparator.length);
  if (!player1Part || !player2Part) return null;

  try {
    return {
      player1: decodeURIComponent(player1Part),
      player2: decodeURIComponent(player2Part),
    };
  } catch {
    return null;
  }
};
