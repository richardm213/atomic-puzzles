import { Link } from "@tanstack/react-router";
import type { AriaRole, MouseEventHandler, ReactNode } from "react";

import { normalizeUsername } from "../../utils/playerNames";

type TournamentPlayerLinkProps = {
  "aria-label"?: string | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
  onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
  role?: AriaRole | undefined;
  tabIndex?: number | undefined;
  title?: string | undefined;
  username: string;
};

export const TournamentPlayerLink = ({
  children,
  username,
  ...props
}: TournamentPlayerLinkProps) => (
  <Link
    {...props}
    to="/tournaments/players/$username"
    params={{ username: normalizeUsername(username) }}
  >
    {children ?? username}
  </Link>
);
