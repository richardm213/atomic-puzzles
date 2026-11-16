import type { ParsedMatch } from "./data";
import { summarizeMatchGames } from "./summaries";
import type { TournamentMatch } from "./tournaments";
import { winnerToFullWord } from "./transforms";

type OfficialResult = Pick<TournamentMatch, "p1" | "p2" | "s1" | "s2" | "outcome_type">;

export const tournamentGameScore = (
  match: ParsedMatch,
  gameId: string,
  result?: OfficialResult | null,
) => {
  const [playerA, playerB] = match.players.map((player) => player.toLowerCase());
  if (!playerA || !playerB) return null;
  const { mappedGames } = summarizeMatchGames(match.games, playerA, playerB);
  const current = mappedGames.find((game) => game.id === gameId);
  if (!current) return null;
  const official = new Map([
    [result?.p1.toLowerCase() ?? "", result?.s1],
    [result?.p2.toLowerCase() ?? "", result?.s2],
  ]);
  const officialA = official.get(playerA);
  const officialB = official.get(playerB);
  const decisive =
    !result?.outcome_type &&
    officialA !== undefined &&
    officialB !== undefined &&
    officialA !== officialB;

  // The official score captures each event's regulation length and tiebreak rules.
  // A final drawn game may be a draw-odds win; credit it only when the published
  // score confirms that exact one-point finish, rather than guessing from clocks.
  const last = mappedGames.at(-1);
  const previous = mappedGames.at(-2);
  if (
    decisive &&
    last &&
    winnerToFullWord(match.games.at(-1)?.winner) === "draw" &&
    last.scoreAAfter === last.scoreBAfter &&
    officialA === (previous?.scoreAAfter ?? 0) + (officialA > officialB ? 1 : 0) &&
    officialB === (previous?.scoreBAfter ?? 0) + (officialB > officialA ? 1 : 0)
  ) {
    last.scoreAAfter = officialA;
    last.scoreBAfter = officialB;
  }
  const clincher = decisive
    ? mappedGames.find((game) => game.scoreAAfter === officialA && game.scoreBAfter === officialB)
    : undefined;
  return {
    scores: new Map([
      [playerA, current.scoreAAfter],
      [playerB, current.scoreBAfter],
    ]),
    gameNumber: current.index + 1,
    clinchedBy: clincher?.id === gameId ? (officialA! > officialB! ? playerA : playerB) : null,
  };
};
