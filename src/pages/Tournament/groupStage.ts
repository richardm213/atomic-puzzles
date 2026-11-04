import {
  isTournamentByePlayer,
  type TournamentBracketStage,
  type TournamentMatch,
} from "../../lib/matches/tournaments";
import { normalizeUsername } from "../../utils/playerNames";

export type GroupStageResult = "W" | "L" | "T";

export type GroupStageHistoryEntry = {
  result: GroupStageResult;
  opponent: string;
  roundName: string;
  match: TournamentMatch;
};

export type GroupStageStanding = {
  playerName: string;
  wins: number;
  losses: number;
  ties: number;
  history: GroupStageHistoryEntry[];
};

export type RoundRobinGroup = {
  name: string;
  rounds: Array<{ roundName: string; matches: TournamentMatch[] }>;
  standings: GroupStageStanding[];
};

export const qualifierGroupName = (matchId: string): string => {
  const match = /-q-r\d+-([a-z])-\d+$/i.exec(matchId);
  return match?.[1]?.toUpperCase() ?? "";
};

const isCompletedGroupMatch = (match: TournamentMatch): boolean =>
  Boolean(
    match.p1 &&
    match.p2 &&
    !isTournamentByePlayer(match.p1) &&
    !isTournamentByePlayer(match.p2) &&
    (match.match_id || match.outcome_type || match.s1 !== 0 || match.s2 !== 0),
  );

const resultForPlayer = (match: TournamentMatch, playerName: string): GroupStageResult => {
  const isPlayerOne = normalizeUsername(match.p1) === normalizeUsername(playerName);
  const playerScore = isPlayerOne ? match.s1 : match.s2;
  const opponentScore = isPlayerOne ? match.s2 : match.s1;
  if (playerScore > opponentScore) return "W";
  if (playerScore < opponentScore) return "L";
  return "T";
};

const buildGroupStandings = (
  rounds: Array<{ roundName: string; matches: TournamentMatch[] }>,
): GroupStageStanding[] => {
  const standings = new Map<string, GroupStageStanding>();
  const getStanding = (playerName: string): GroupStageStanding => {
    const key = normalizeUsername(playerName);
    const existing = standings.get(key);
    if (existing) return existing;
    const standing = { playerName, wins: 0, losses: 0, ties: 0, history: [] };
    standings.set(key, standing);
    return standing;
  };

  rounds.forEach(({ roundName, matches }) => {
    matches.forEach((match) => {
      [match.p1, match.p2]
        .filter((playerName) => playerName && !isTournamentByePlayer(playerName))
        .forEach(getStanding);
      if (!isCompletedGroupMatch(match)) return;

      [match.p1, match.p2].forEach((playerName) => {
        const standing = getStanding(playerName);
        const result = resultForPlayer(match, playerName);
        if (result === "W") standing.wins += 1;
        if (result === "L") standing.losses += 1;
        if (result === "T") standing.ties += 1;
        standing.history.push({
          result,
          opponent:
            normalizeUsername(playerName) === normalizeUsername(match.p1) ? match.p2 : match.p1,
          roundName,
          match,
        });
      });
    });
  });

  return [...standings.values()].sort(
    (left, right) =>
      right.wins - left.wins ||
      right.ties - left.ties ||
      left.losses - right.losses ||
      left.playerName.localeCompare(right.playerName),
  );
};

export const buildRoundRobinGroups = (stage: TournamentBracketStage): RoundRobinGroup[] => {
  const groupNames = [
    ...new Set(
      stage.rounds.flatMap((round) => round.matches.map((match) => qualifierGroupName(match.id))),
    ),
  ]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return groupNames.map((name) => {
    const rounds = stage.rounds.map((round) => ({
      roundName: round.roundName,
      matches: round.matches.filter((match) => qualifierGroupName(match.id) === name),
    }));
    return { name, rounds, standings: buildGroupStandings(rounds) };
  });
};
