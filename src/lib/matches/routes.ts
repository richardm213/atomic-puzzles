import type { Mode } from "../../constants/matches";

type MatchRouteInput = {
  mode?: string | null | undefined;
  matchId?: string | number | null | undefined;
  firstGameId?: string | number | null | undefined;
  gameCount?: number | null | undefined;
  games?: unknown[] | null | undefined;
  [key: string]: unknown;
};

export const normalizeMatchMode = (mode: unknown): Mode | "" => {
  const value = String(mode ?? "").toLowerCase();
  if (
    value === "blitz" ||
    value === "bullet" ||
    value === "hyperbullet" ||
    value === "wolfrandom"
  ) {
    return value;
  }
  return "";
};

export const buildMatchRouteParams = (
  match: MatchRouteInput | null | undefined,
): { mode: Mode | ""; matchId: string } => ({
  mode: normalizeMatchMode(match?.mode),
  matchId: String(match?.matchId ?? ""),
});

export const hasMatchRouteParams = (match: MatchRouteInput | null | undefined): boolean =>
  Boolean(normalizeMatchMode(match?.mode) && String(match?.matchId ?? "").trim());

export const shouldUseInternalMatchPage = (match: MatchRouteInput | null | undefined): boolean =>
  hasMatchRouteParams(match) &&
  (normalizeMatchMode(match?.mode) === "wolfrandom" || !isSingleGameMatch(match));

export const isSingleGameMatch = (match: MatchRouteInput | null | undefined): boolean => {
  if (Array.isArray(match?.games)) return match.games.length === 1;
  return match?.gameCount === 1;
};

export const buildLichessGameUrl = (
  gameId: string | number | null | undefined,
  options: { orientation?: "white" | "black"; ply?: number | null | undefined } = {},
): string => {
  const normalizedGameId = String(gameId ?? "").trim();
  if (!normalizedGameId || normalizedGameId === "—") return "";

  const orientationPath = options.orientation ? `/${options.orientation}` : "";
  const ply = Number(options.ply);
  const plyHash = Number.isInteger(ply) && ply >= 0 ? `#${ply}` : "";

  return `https://lichess.org/${encodeURIComponent(normalizedGameId)}${orientationPath}${plyHash}`;
};

export const isChessComSource = (source: unknown): boolean => {
  const normalizedSource = String(source ?? "")
    .trim()
    .toLowerCase();
  return (
    normalizedSource.includes("chesscom") ||
    normalizedSource.includes("chess.com") ||
    normalizedSource.includes("chess_com")
  );
};

export const buildChessComGameUrl = (gameId: string | number | null | undefined): string => {
  const normalizedGameId = String(gameId ?? "").trim();
  if (!normalizedGameId || normalizedGameId === "—") return "";
  return `https://www.chess.com/variants/atomic/game/${encodeURIComponent(normalizedGameId)}`;
};

export const buildExternalGameUrl = (
  gameId: string | number | null | undefined,
  options: {
    source?: unknown;
    orientation?: "white" | "black";
    ply?: number | null | undefined;
  } = {},
): string => {
  const normalizedGameId = String(gameId ?? "").trim();
  if (!normalizedGameId || normalizedGameId === "—") return "";

  if (isChessComSource(options.source)) {
    return buildChessComGameUrl(normalizedGameId);
  }

  return buildLichessGameUrl(normalizedGameId, {
    ...(options.orientation ? { orientation: options.orientation } : {}),
    ...(options.ply !== undefined ? { ply: options.ply } : {}),
  });
};

export const buildSingleGameMatchUrl = (match: MatchRouteInput | null | undefined): string => {
  if (!isSingleGameMatch(match)) return "";
  const firstGameFromGames = Array.isArray(match?.games)
    ? (match.games[0] as { id?: string | number | null | undefined } | null | undefined)?.id
    : undefined;
  const candidates = [match?.firstGameId, firstGameFromGames, match?.matchId];
  for (const candidate of candidates) {
    const url = buildExternalGameUrl(candidate, { source: match?.sourceValue ?? match?.source });
    if (url) return url;
  }
  return "";
};
