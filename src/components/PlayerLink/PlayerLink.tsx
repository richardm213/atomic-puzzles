import { Link } from "@tanstack/react-router";
import { type AriaRole, forwardRef, type MouseEventHandler, type ReactNode } from "react";

import { PlayerHoverCardTrigger } from "../PlayerHoverCard/PlayerHoverCard";

type PlayerLinkProps = {
  "aria-label"?: string | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
  onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
  role?: AriaRole | undefined;
  tabIndex?: number | undefined;
  title?: string | undefined;
  username: string;
};

export const PlayerLink = forwardRef<HTMLAnchorElement, PlayerLinkProps>(
  ({ children, username, ...props }, ref) => {
    return (
      <PlayerHoverCardTrigger username={username} anchorRef={ref}>
        {(triggerProps) => (
          <Link {...props} {...triggerProps} to="/@/$username" params={{ username }}>
            {children}
          </Link>
        )}
      </PlayerHoverCardTrigger>
    );
  },
);

PlayerLink.displayName = "PlayerLink";
