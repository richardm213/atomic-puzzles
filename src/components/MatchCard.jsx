import { Link } from "@tanstack/react-router";
import { formatLocalDateTime, formatScore, formatSignedDecimal } from "../utils/formatters";

export const MatchCard = ({ match, matchKey, isExpanded, onToggle }) => (
  <article
    key={matchKey}
    className={`matchCard${isExpanded ? " expanded" : ""}`}
    onClick={onToggle}
  >
    <div className="matchCardHeader">
      <div className="matchCardPlayers">
        <Link
          className="rankingLink"
          to="/@/$username"
          params={{ username: match.playerA }}
          onClick={(event) => event.stopPropagation()}
        >
          {match.playerA}
        </Link>
        <span>vs</span>
        <Link
          className="rankingLink"
          to="/@/$username"
          params={{ username: match.playerB }}
          onClick={(event) => event.stopPropagation()}
        >
          {match.playerB}
        </Link>
      </div>
      <div className="scoreCell">
        <span>{formatScore(match.scoreA)}</span>
        <span className="scoreDash"> - </span>
        <span>{formatScore(match.scoreB)}</span>
      </div>
    </div>
    <div className="matchCardMeta">
      <span>
        {match.firstGameId === "—" ? (
          formatLocalDateTime(match.startTs)
        ) : (
          <a
            className="rankingLink"
            href={`https://lichess.org/${encodeURIComponent(match.firstGameId)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {formatLocalDateTime(match.startTs)}
          </a>
        )}
      </span>
      <span>TC {match.timeControl}</span>
      <span>Source: {match.sourceValue}</span>
    </div>
    {isExpanded ? (
      <div className="matchCardDetails">
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
        <div className="matchGamesHeader">
          <strong>Game</strong>
          <strong>Result</strong>
          <strong>ID</strong>
        </div>
        <ul className="matchGamesList">
          {match.games.map((game) => (
            <li key={`${matchKey}-${game.id}-${game.index}`} className="matchGameRow">
              <span>Game {game.index + 1}</span>
              <span>{game.resultLabel}</span>
              <span>
                {game.id === "—" ? (
                  "—"
                ) : (
                  <a
                    className="rankingLink"
                    href={`https://lichess.org/${encodeURIComponent(game.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {game.id}
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </article>
);
