import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";

import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import type { ArchiveGame } from "../../lib/archive/games";
import { loadRawMatchById, type ParsedMatchGame } from "../../lib/matches/data";
import { formatScore } from "../../utils/formatters";

const scoreForPlayer = (game: ParsedMatchGame, username: string): number => {
  if (game.winner === "draw") return 0.5;
  const winner = game.winner === "white" ? game.white : game.black;
  return winner.toLowerCase() === username.toLowerCase() ? 1 : 0;
};

const resultLabel = (score: number): string => (score === 0.5 ? "½" : String(score));
const resultClass = (score: number): string =>
  score === 1 ? "score win" : score === 0 ? "score loss" : "score draw";

export const GameMatchCrosstable = ({
  game,
  embedded = false,
}: {
  game: ArchiveGame;
  embedded?: boolean;
}) => {
  const matchQuery = useQuery({
    queryKey: ["games", "match-crosstable", game.external_match_id],
    queryFn: () => loadRawMatchById(game.external_match_id),
    enabled: Boolean(game.external_match_id),
    staleTime: 10 * 60 * 1_000,
  });
  const match = matchQuery.data;
  if (!match) {
    if (!embedded) return null;
    return (
      <p className="gameUnderboardState">
        {matchQuery.isError ? "Unable to load this match." : "Loading crosstable…"}
      </p>
    );
  }
  if (match.games.length < 2) {
    return embedded ? (
      <p className="gameUnderboardState">No other games are archived in this match.</p>
    ) : null;
  }
  const [playerOne, playerTwo] = match.players;
  const gameScores = match.games.map((matchGame) => ({
    matchGame,
    playerOne: scoreForPlayer(matchGame, playerOne),
    playerTwo: scoreForPlayer(matchGame, playerTwo),
  }));
  const playerOneTotal = gameScores.reduce((sum, result) => sum + result.playerOne, 0);
  const playerTwoTotal = gameScores.reduce((sum, result) => sum + result.playerTwo, 0);
  const dense = match.games.length > 8;

  const content = (
    <>
      {!embedded ? (
        <div className="gameMatchCrosstableHeading">
          <h2 id="game-match-crosstable-title">Crosstable</h2>
          <span>{match.games.length} games</span>
        </div>
      ) : null}
      <div className="gameMatchCrosstableScroll">
        <div
          className={`gameMatchCrosstableStrip${dense ? " dense" : ""}`}
          style={{ "--game-count": match.games.length } as CSSProperties}
        >
          <ol className="gameMatchResults" aria-label="Games in this match">
            {gameScores.map((result, index) => (
              <li
                key={result.matchGame.id}
                className={result.matchGame.id === game.game_id ? "current" : ""}
              >
                <LichessGameLink
                  gameId={result.matchGame.id}
                  source={match.source}
                  className="gameMatchResultLink"
                  title={`Game ${index + 1}`}
                >
                  <span className={resultClass(result.playerOne)}>
                    {resultLabel(result.playerOne)}
                  </span>
                  <span className={resultClass(result.playerTwo)}>
                    {resultLabel(result.playerTwo)}
                  </span>
                </LichessGameLink>
              </li>
            ))}
          </ol>
          <div className="gameMatchPlayers">
            <PlayerLink username={playerOne}>{playerOne}</PlayerLink>
            <PlayerLink username={playerTwo}>{playerTwo}</PlayerLink>
          </div>
          <div className="gameMatchTotals" aria-label="Match score">
            <strong>{formatScore(playerOneTotal)}</strong>
            <strong>{formatScore(playerTwoTotal)}</strong>
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) return <div className="gameMatchCrosstableEmbedded">{content}</div>;

  return (
    <section className="gameMatchCrosstable" aria-labelledby="game-match-crosstable-title">
      {content}
    </section>
  );
};
