import type { MouseEventHandler, ReactNode } from "react";

import { buildExternalGameUrl } from "../../lib/matches/routes";

export type LichessGameLinkProps = {
  gameId: string | number;
  source?: unknown;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
};

export const LichessGameLink = ({
  gameId,
  source,
  children,
  className = "rankingLink",
  onClick,
}: LichessGameLinkProps) => {
  const gameUrl = buildExternalGameUrl(gameId, { source });
  if (!gameUrl) return <>{children}</>;

  return (
    <a className={className} href={gameUrl} target="_blank" rel="noreferrer" onClick={onClick}>
      {children}
    </a>
  );
};
