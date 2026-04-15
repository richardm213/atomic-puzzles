import { Link } from "@tanstack/react-router";
import { LichessGameLink } from "../LichessGameLink/LichessGameLink";
import { formatLocalDateTime, formatScore, formatSignedDecimal } from "../../utils/formatters";
import "./MatchCard.css";

const scoreTone = (score, opponentScore) => {
  const numericScore = Number(score);
  const numericOpponentScore = Number(opponentScore);
  if (numericScore > numericOpponentScore) return " winner";
  if (numericScore < numericOpponentScore) return " loser";
  return "";
};

const handleCardKeyDown = (event, onToggle) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onToggle();
};

export const MatchCard = ({ match, matchKey, isExpanded, onToggle }) => (
  <article
    key={matchKey}
    className={`matchCard${isExpanded ? " expanded" : ""}`}
    onClick={onToggle}
    onKeyDown={(event) => handleCardKeyDown(event, onToggle)}
    role="button"
    tabIndex={0}
    aria-expanded={isExpanded}
  >
    <div className="matchCardHeader">
      <div className="matchCardMain">
        <div className="matchCardPlayers">
          <Link
            className="matchPlayerLink"
            to="/@/$username"
            params={{ username: match.playerA }}
            onClick={(event) => event.stopPropagation()}
          >
            {match.playerA}
          </Link>
          <span className="matchVersus">vs</span>
          <Link
            className="matchPlayerLink"
            to="/@/$username"
            params={{ username: match.playerB }}
            onClick={(event) => event.stopPropagation()}
          >
            {match.playerB}
          </Link>
        </div>
        <div className="matchCardMeta">
          <span className="matchMetaPill">
            <LichessGameLink
              gameId={match.firstGameId}
              className="matchMetaLink"
              onClick={(event) => event.stopPropagation()}
            >
              {formatLocalDateTime(match.startTs)}
            </LichessGameLink>
          </span>
          <span className="matchMetaPill">{match.timeControl}</span>
          <span className="matchMetaPill">{match.sourceValue}</span>
        </div>
      </div>
      <div className="matchScoreBlock" aria-label={`Score ${match.scoreA} to ${match.scoreB}`}>
        <span className={`matchScoreValue${scoreTone(match.scoreA, match.scoreB)}`}>
          {formatScore(match.scoreA)}
        </span>
        <span className="scoreDash">-</span>
        <span className={`matchScoreValue${scoreTone(match.scoreB, match.scoreA)}`}>
          {formatScore(match.scoreB)}
        </span>
      </div>
      <span className="matchExpandCue">{isExpanded ? "Less" : "Details"}</span>
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
        <div className="matchGames">
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
                  <LichessGameLink gameId={game.id} onClick={(event) => event.stopPropagation()}>
                    {game.id}
                  </LichessGameLink>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    ) : null}
  </article>
);
