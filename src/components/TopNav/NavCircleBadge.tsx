import type { ReactNode } from "react";

export const NavCircleBadge = ({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) => (
  <span className={`navCircleBadge ${className}`} aria-hidden="true">
    {children}
  </span>
);
