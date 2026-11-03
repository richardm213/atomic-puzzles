import type { FocusEventHandler, MouseEventHandler, PointerEventHandler, ReactNode } from "react";

import { buildExternalGameUrl, isChessComSource } from "../../lib/matches/routes";

export type LichessGameLinkProps = {
  gameId: string | number;
  source?: unknown;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
  onPointerEnter?: PointerEventHandler<HTMLAnchorElement>;
  onPointerLeave?: PointerEventHandler<HTMLAnchorElement>;
  onFocus?: FocusEventHandler<HTMLAnchorElement>;
  onBlur?: FocusEventHandler<HTMLAnchorElement>;
  title?: string;
  orientation?: "white" | "black";
  ply?: number;
};

export const LichessGameLink = ({
  gameId,
  source,
  children,
  className = "rankingLink",
  onClick,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  title,
  orientation,
  ply,
}: LichessGameLinkProps) => {
  const interactionProps = { onClick, onPointerEnter, onPointerLeave, onFocus, onBlur, title };
  const normalizedGameId = String(gameId)
    .replace(/^chesscom:/i, "")
    .trim();
  if (isChessComSource(source) && normalizedGameId) {
    return (
      <a
        className={className}
        href={`/games/${encodeURIComponent(normalizedGameId)}`}
        {...interactionProps}
      >
        {children}
      </a>
    );
  }
  const gameUrl = buildExternalGameUrl(gameId, {
    source,
    ...(orientation ? { orientation } : {}),
    ...(ply !== undefined ? { ply } : {}),
  });
  if (!gameUrl) return <>{children}</>;

  return (
    <a className={className} href={gameUrl} target="_blank" rel="noreferrer" {...interactionProps}>
      {children}
    </a>
  );
};
