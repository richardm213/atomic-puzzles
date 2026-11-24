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
  variant?: "profile" | "puzzles" | "betting" | undefined;
  username: string;
};

export const PlayerLink = forwardRef<HTMLAnchorElement, PlayerLinkProps>(
  ({ children, username, variant = "profile", ...props }, ref) => {
    const route =
      variant === "betting"
        ? "/@/$username/betting"
        : variant === "puzzles"
          ? "/@/$username/puzzles"
          : "/@/$username";
    return (
      <PlayerHoverCardTrigger username={username} anchorRef={ref}>
        {(triggerProps) => (
          <Link {...props} {...triggerProps} to={route} params={{ username }}>
            {children}
          </Link>
        )}
      </PlayerHoverCardTrigger>
    );
  },
);

PlayerLink.displayName = "PlayerLink";
