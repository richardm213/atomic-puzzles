export type WolfarenaMatchStatus =
  "played" | "partial-forfeit" | "forfeit" | "double-forfeit" | "bye";

export type WolfarenaMatch = {
  id: string;
  player1: string;
  player2: string;
  score1: number | null;
  score2: number | null;
  points1: number;
  points2: number;
  status: WolfarenaMatchStatus;
  matchId: string;
  additionalMatchIds?: readonly string[];
};

export type WolfarenaStanding = {
  rank: number;
  player: string;
  points: number;
  pointsChange: number;
  rating: number | null;
  ratingChange: number;
  streak: boolean;
};

export type WolfarenaRound = {
  number: number;
  date: string;
  kind: "Principal" | "Secondary";
  sourcePostId: string;
  matches: readonly WolfarenaMatch[];
  standings: readonly WolfarenaStanding[];
};

export type WolfarenaTournament = {
  id: string;
  title: string;
  champion: string;
  sourceUrl: string;
  logUrl: string;
  rounds: readonly WolfarenaRound[];
};

export const formatWolfarenaPoints = (points: number): string => points.toFixed(1);

export const wolfarenaRoundSourceUrl = (
  tournament: WolfarenaTournament,
  round: WolfarenaRound,
): string => `${tournament.logUrl}#${round.sourcePostId}`;
