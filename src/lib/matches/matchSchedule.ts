import { isTournamentByeMatch, type TournamentMatch } from "./tournaments";

const kickoffFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export const formatMatchKickoff = (timestamp: number): string => kickoffFormat.format(timestamp);

export const getMatchKickoff = (match: TournamentMatch): number | null => {
  if (!match.scheduled_at || !match.p1 || !match.p2 || isTournamentByeMatch(match)) return null;
  const timestamp = Date.parse(match.scheduled_at);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const hasTournamentMatchResult = (match: TournamentMatch): boolean =>
  Boolean(match.match_id || match.played_on || match.outcome_type || match.s1 || match.s2);
