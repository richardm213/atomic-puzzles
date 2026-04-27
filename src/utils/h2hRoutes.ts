const matchSlugSeparator = "-vs-";

export type Matchup = { player1: string; player2: string };

export const matchupToSlug = (player1: string, player2: string): string =>
  `${encodeURIComponent(player1)}${matchSlugSeparator}${encodeURIComponent(player2)}`;

export const parseMatchupSlug = (matchup: string | null | undefined): Matchup | null => {
  const matchupStr = String(matchup ?? "");
  const separatorIndex = matchupStr.indexOf(matchSlugSeparator);
  if (separatorIndex <= 0) return null;
  const player1Part = matchupStr.slice(0, separatorIndex);
  const player2Part = matchupStr.slice(separatorIndex + matchSlugSeparator.length);
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
