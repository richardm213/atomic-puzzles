import type { Mode } from "../constants/matches";

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
  if (value === "blitz" || value === "bullet" || value === "hyperbullet") return value;
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

export const isSingleGameMatch = (match: MatchRouteInput | null | undefined): boolean => {
  if (Array.isArray(match?.games)) return match.games.length === 1;
  return match?.gameCount === 1;
};

export const buildLichessGameUrl = (
  gameId: string | number | null | undefined,
): string => {
  const normalizedGameId = String(gameId ?? "").trim();
  return normalizedGameId && normalizedGameId !== "—"
    ? `https://lichess.org/${encodeURIComponent(normalizedGameId)}`
    : "";
};

export const buildSingleGameMatchUrl = (
  match: MatchRouteInput | null | undefined,
): string => {
  if (!isSingleGameMatch(match)) return "";
  const firstGameFromGames = Array.isArray(match?.games)
    ? (match.games[0] as { id?: string | number | null | undefined } | null | undefined)?.id
    : undefined;
  const candidates = [match?.firstGameId, firstGameFromGames, match?.matchId];
  for (const candidate of candidates) {
    const url = buildLichessGameUrl(candidate);
    if (url) return url;
  }
  return "";
};
