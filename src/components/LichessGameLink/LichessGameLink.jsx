export const lichessGameUrl = (gameId) =>
  `https://lichess.org/${encodeURIComponent(String(gameId))}`;

export const LichessGameLink = ({ gameId, children, className = "rankingLink", onClick }) => {
  if (gameId === "—") return children;

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
