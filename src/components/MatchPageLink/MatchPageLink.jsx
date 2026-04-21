import { Link } from "@tanstack/react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { buildMatchRouteParams, hasMatchRouteParams } from "../../utils/matchRoutes";
import "./MatchPageLink.css";

export const MatchPageLink = ({ match, className = "", onClick, title = "Open match page" }) => {
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
