import type { Mode } from "../constants/matches";

type MatchRouteInput = {
  mode?: string | null | undefined;
  matchId?: string | number | null | undefined;
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
