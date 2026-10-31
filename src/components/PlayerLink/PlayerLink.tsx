import { Link } from "@tanstack/react-router";
import { type AriaRole, forwardRef, type MouseEventHandler, type ReactNode } from "react";

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
      <Link ref={ref} {...props} to="/@/$username" params={{ username }}>
        {children}
      </Link>
    );
  },
);

PlayerLink.displayName = "PlayerLink";
