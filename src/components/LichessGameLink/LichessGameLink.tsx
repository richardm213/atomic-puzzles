import type { FocusEventHandler, MouseEventHandler, PointerEventHandler, ReactNode } from "react";

import { useAppSettings } from "../../context/AppSettings";
import {
  buildAtomicPuzzlesGameUrl,
  buildExternalGameUrl,
  shouldUseAtomicPuzzlesGameLink,
} from "../../lib/matches/routes";

export type LichessGameLinkProps = {
  gameId: string | number;
  source?: unknown;
  mode?: unknown;
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
  mode,
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
  const { lichessLinkTarget } = useAppSettings();
  const interactionProps = { onClick, onPointerEnter, onPointerLeave, onFocus, onBlur, title };
  const normalizedGameId = String(gameId)
    .replace(/^(?:chesscom|pychess):/i, "")
    .trim();
  const internalGameUrl = buildAtomicPuzzlesGameUrl(normalizedGameId);
  if (shouldUseAtomicPuzzlesGameLink({ source, mode, lichessLinkTarget }) && internalGameUrl) {
    return (
      <a
        className={className}
        href={internalGameUrl}
        target="_blank"
        rel="noreferrer"
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
