import {
  atomicChessLeagueSeasons,
  getAtomicChessLeaguePlayerName,
} from "../../lib/matches/atomicChessLeague";
import type {
  TournamentMeta,
  TournamentPlayerAppearance,
  TournamentPlayerMatch,
  TournamentPlayerResult,
} from "../../lib/matches/tournaments";
import { compareTournamentStartDates } from "../../lib/matches/tournaments";
import { normalizeUsername } from "../../utils/playerNames";

const ordinal = (rank: number): string => {
  const remainder = rank % 100;
  if (remainder >= 11 && remainder <= 13) return `${rank}th`;
  if (rank % 10 === 1) return `${rank}st`;
  if (rank % 10 === 2) return `${rank}nd`;
  if (rank % 10 === 3) return `${rank}rd`;
  return `${rank}th`;
};

const scoreResult = (playerScore: number, opponentScore: number): TournamentPlayerResult => {
  if (playerScore > opponentScore) return "win";
  if (playerScore < opponentScore) return "loss";
  return "draw";
};

const aclTournamentMeta = (
  catalog: TournamentMeta[],
  seasonNumber: number,
  year: number,
): TournamentMeta | undefined =>
  catalog.find((tournament) => tournament.id === `acl-s${seasonNumber}`) ??
  catalog.find((tournament) => tournament.seriesKey === "acl" && tournament.year === year);

export const isTournamentTitlePlacement = (placementLabel: string): boolean =>
  placementLabel === "Champion" || placementLabel === "1st" || placementLabel.startsWith("1st ");

export const countTournamentPlayerTitles = (
  appearances: TournamentPlayerAppearance[],
): { titles: number; teamTitles: number } =>
  appearances.reduce(
    (counts, appearance) => {
      if (!isTournamentTitlePlacement(appearance.placementLabel)) return counts;
      if (appearance.tournament.seriesKey === "acl") {
        counts.teamTitles += 1;
      } else {
        counts.titles += 1;
      }
      return counts;
    },
    { titles: 0, teamTitles: 0 },
  );

export const buildAtomicChessLeaguePlayerAppearances = (
  catalog: TournamentMeta[],
  usernames: string[],
): TournamentPlayerAppearance[] => {
  const playerKeys = new Set(usernames.map(normalizeUsername).filter(Boolean));
  if (!playerKeys.size) return [];

  return atomicChessLeagueSeasons
    .flatMap((season): TournamentPlayerAppearance[] => {
      const tournament = aclTournamentMeta(catalog, season.number, season.year);
      if (!tournament) return [];

      const division = season.divisions.find((entry) =>
        entry.teams.some((team) =>
          team.players.some((player) =>
            playerKeys.has(normalizeUsername(getAtomicChessLeaguePlayerName(player))),
          ),
        ),
      );
      const team = division?.teams.find((entry) =>
        entry.players.some((player) =>
          playerKeys.has(normalizeUsername(getAtomicChessLeaguePlayerName(player))),
        ),
      );
      if (!division || !team) return [];

      const matches = division.rounds.flatMap((round): TournamentPlayerMatch[] =>
        round.matchups.flatMap((matchup) =>
          matchup.boards.flatMap((board): TournamentPlayerMatch[] => {
            const playerOne = normalizeUsername(getAtomicChessLeaguePlayerName(board.player1));
            const playerTwo = normalizeUsername(getAtomicChessLeaguePlayerName(board.player2));
            const isPlayerOne = playerKeys.has(playerOne);
            if (!isPlayerOne && !playerKeys.has(playerTwo)) return [];
            const playerScore = Number(isPlayerOne ? board.score1 : board.score2);
            const opponentScore = Number(isPlayerOne ? board.score2 : board.score1);
            const result =
              Number.isFinite(playerScore) && Number.isFinite(opponentScore)
                ? scoreResult(playerScore, opponentScore)
                : "unplayed";

            return [
              {
                key: `acl-s${season.number}-${division.id}-${round.number}-${board.timeControl}-${playerOne}-${playerTwo}`,
                roundLabel: `Round ${round.number} · ${board.timeControl}`,
                opponent: getAtomicChessLeaguePlayerName(
                  isPlayerOne ? board.player2 : board.player1,
                ),
                playerScore: Number.isFinite(playerScore) ? playerScore : 0,
                opponentScore: Number.isFinite(opponentScore) ? opponentScore : 0,
                result,
                matchId: board.matchId ?? "",
                outcomeType: board.status === "forfeit" ? "withdrawal" : "",
              },
            ];
          }),
        ),
      );

      return [
        {
          tournament,
          placementLabel: ordinal(team.rank),
          placementFieldLabel: `${division.teams.length} ${division.teams.length === 1 ? "team" : "teams"}`,
          divisionLabel: division.name,
          wins: matches.filter((match) => match.result === "win").length,
          losses: matches.filter((match) => match.result === "loss").length,
          draws: matches.filter((match) => match.result === "draw").length,
          matches: [...matches].reverse(),
        },
      ];
    })
    .sort((left, right) => compareTournamentStartDates(left.tournament, right.tournament));
};

export const mergeTournamentPlayerAppearances = (
  ...appearanceGroups: TournamentPlayerAppearance[][]
): TournamentPlayerAppearance[] => {
  const byTournament = new Map<string, TournamentPlayerAppearance>();
  appearanceGroups.flat().forEach((appearance) => {
    byTournament.set(appearance.tournament.id, appearance);
  });
  return [...byTournament.values()].sort((left, right) =>
    compareTournamentStartDates(left.tournament, right.tournament),
  );
};
