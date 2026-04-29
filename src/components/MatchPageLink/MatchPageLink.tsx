import "./MatchPageLink.css";

import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import type { MouseEventHandler } from "react";

import { buildMatchRouteParams, hasMatchRouteParams } from "../../utils/matchRoutes";

export type MatchPageLinkMatch = Parameters<typeof buildMatchRouteParams>[0];

export type MatchPageLinkProps = {
  match: MatchPageLinkMatch;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  title?: string;
};

export const MatchPageLink = ({
  match,
  className = "",
  onClick,
  title = "Open match page",
}: MatchPageLinkProps) => {
  if (!hasMatchRouteParams(match)) return null;

  return (
    <Link
      className={`matchPageLink ${className}`.trim()}
      to="/matches/$mode/$matchId"
      params={buildMatchRouteParams(match)}
      target="_blank"
      rel="noreferrer"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={faUpRightFromSquare} />
    </Link>
  );
};
