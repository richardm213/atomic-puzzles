export const normalizeMatchMode = (mode) => {
  const value = String(mode || "").toLowerCase();
  if (value === "blitz" || value === "bullet" || value === "hyperbullet") return value;
  return "";
};

export const buildMatchRouteParams = (match) => ({
  mode: normalizeMatchMode(match?.mode),
  matchId: String(match?.matchId || ""),
});

export const hasMatchRouteParams = (match) =>
  Boolean(normalizeMatchMode(match?.mode) && String(match?.matchId || "").trim());
