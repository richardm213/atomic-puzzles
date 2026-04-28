import type { MouseEventHandler, ReactNode } from "react";

const lichessGameUrl = (gameId: string | number): string =>
  `https://lichess.org/${encodeURIComponent(String(gameId))}`;

export type LichessGameLinkProps = {
  gameId: string | number;
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
};

export const LichessGameLink = ({
  gameId,
  children,
  className = "rankingLink",
  onClick,
}: LichessGameLinkProps) => {
  if (gameId === "—") return <>{children}</>;

  return (
    <a
      className={className}
      href={lichessGameUrl(gameId)}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
    >
      {children}
    </a>
  );
};
