import "./BannedPlayerMark.css";

import { faBan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";

import { aliasesLookupQueryOptions } from "../../lib/users/aliasQueries";
import { normalizeUsername } from "../../utils/playerNames";

export const BannedPlayerMark = ({ username }: { username: string }) => {
  const { data: aliases } = useQuery(aliasesLookupQueryOptions());
  if (!aliases?.get(normalizeUsername(username))?.banned) return null;

  return (
    <span className="bannedPlayerMark" role="img" aria-label="Banned player" title="Banned player">
      <FontAwesomeIcon icon={faBan} aria-hidden="true" />
    </span>
  );
};
