import "./MatchCard.css";

import { Link } from "@tanstack/react-router";
import type { MouseEventHandler } from "react";

import type { MatchCardData } from "../../types/matchCard";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";
import { scoreToneClass } from "../../utils/matchPresentation";
import { isToggleActionKey } from "../../utils/toggleActionKey";
import { LichessGameLink } from "../LichessGameLink/LichessGameLink";
import { MatchDetails } from "../MatchDetails/MatchDetails";
import { MatchPageLink } from "../MatchPageLink/MatchPageLink";

export type MatchCardProps = {
  match: MatchCardData;
  matchKey: string;
  isExpanded: boolean;
  onToggle: () => void;
};

const stopPropagation: MouseEventHandler = (event) => event.stopPropagation();

export const MatchCard = ({ match, matchKey, isExpanded, onToggle }: MatchCardProps) => (
  <article
    key={matchKey}
    className={`matchCard${isExpanded ? " expanded" : ""}`}
    onClick={onToggle}
    onKeyDown={(event) => {
      if (!isToggleActionKey(event)) return;
      event.preventDefault();
      onToggle();
    }}
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
            onClick={stopPropagation}
          >
            {match.playerA}
          </Link>
          <span className="matchVersus">vs</span>
          <Link
            className="matchPlayerLink"
            to="/@/$username"
            params={{ username: match.playerB }}
            onClick={stopPropagation}
          >
            {match.playerB}
          </Link>
        </div>
        <div className="matchCardMeta">
          <span className="matchMetaPill">
            <LichessGameLink
              gameId={match.firstGameId}
              className="matchMetaLink"
              onClick={stopPropagation}
            >
              {formatLocalDateTime(match.startTs)}
            </LichessGameLink>
          </span>
          <span className="matchMetaPill">{match.timeControl}</span>
          <span className="matchMetaPill">{match.sourceValue}</span>
        </div>
      </div>
      <div className="matchScoreBlock" aria-label={`Score ${match.scoreA} to ${match.scoreB}`}>
        <span className={`matchScoreValue${scoreToneClass(match.scoreA, match.scoreB)}`}>
          {formatScore(match.scoreA)}
        </span>
        <span className="scoreDash">-</span>
        <span className={`matchScoreValue${scoreToneClass(match.scoreB, match.scoreA)}`}>
          {formatScore(match.scoreB)}
        </span>
      </div>
      <MatchPageLink
        match={match}
        onClick={stopPropagation}
        title="Open match page in new tab"
      />
      <span className="matchExpandCue">{isExpanded ? "Less" : "Details"}</span>
    </div>
    {isExpanded ? (
      <div className="matchCardDetails">
        <MatchDetails match={match} matchKey={matchKey} stopPropagation={stopPropagation} />
      </div>
    ) : null}
  </article>
);
