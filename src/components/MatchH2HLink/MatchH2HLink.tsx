import "./MatchH2HLink.css";

import { faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import type { MouseEventHandler } from "react";

import { matchupToSlug } from "../../utils/h2hRoutes";

type MatchH2HLinkProps = {
  playerA: string;
  playerB: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export const MatchH2HLink = ({ playerA, playerB, onClick }: MatchH2HLinkProps) => (
  <Link
    className="matchH2HLink"
    to="/h2h/$matchup"
    params={{ matchup: matchupToSlug(playerA, playerB) }}
    onClick={onClick}
    title={`View H2H: ${playerA} vs ${playerB}`}
    aria-label={`View H2H: ${playerA} vs ${playerB}`}
  >
    <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
    <span>H2H</span>
  </Link>
);
