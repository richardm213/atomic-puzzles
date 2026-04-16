import { LichessGameLink } from "../LichessGameLink/LichessGameLink";
import { formatScore, formatSignedDecimal } from "../../utils/formatters";
import "../MatchCard/MatchCard.css";

export const MatchDetails = ({ match, matchKey, showRunningScore = false, stopPropagation }) => (
  <>
    <div className="matchCardPlayerStats">
      <div>
        <strong>{match.playerA}</strong>
        <span>
          {`Rating ${match.playerABeforeRating} (${formatSignedDecimal(
            match.playerAAfterRating - match.playerABeforeRating,
          )})`}
        </span>
        <span>
          {`RD ${match.playerABeforeRd} (${formatSignedDecimal(
            match.playerAAfterRd - match.playerABeforeRd,
          )})`}
        </span>
      </div>
      <div>
        <strong>{match.playerB}</strong>
        <span>
          {`Rating ${match.playerBBeforeRating} (${formatSignedDecimal(
            match.playerBAfterRating - match.playerBBeforeRating,
          )})`}
        </span>
        <span>
          {`RD ${match.playerBBeforeRd} (${formatSignedDecimal(
            match.playerBAfterRd - match.playerBBeforeRd,
          )})`}
        </span>
      </div>
    </div>
    <div className="matchGames">
      <div className="matchGamesHeader">
        <strong>Game</strong>
        <strong>Result</strong>
        {showRunningScore ? <strong>Score</strong> : null}
        <strong>ID</strong>
      </div>
      <ul className="matchGamesList">
        {match.games.map((game) => (
          <li key={`${matchKey}-${game.id}-${game.index}`} className="matchGameRow">
            <span>Game {game.index + 1}</span>
            <span>{game.resultLabel}</span>
            {showRunningScore ? (
              <span>{`${formatScore(game.scoreAAfter)} - ${formatScore(game.scoreBAfter)}`}</span>
            ) : null}
            <span>
              <LichessGameLink gameId={game.id} onClick={stopPropagation}>
                {game.id}
              </LichessGameLink>
            </span>
          </li>
        ))}
      </ul>
    </div>
  </>
);
