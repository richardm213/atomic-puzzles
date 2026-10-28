import { Link } from "@tanstack/react-router";
import type { AriaRole, MouseEventHandler, ReactNode } from "react";

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

export const PlayerLink = ({ children, username, ...props }: PlayerLinkProps) => (
  <Link {...props} to="/@/$username" params={{ username }}>
    {children}
  </Link>
);
