import type { CSSProperties } from "react";

export const analysisBoardSize = (viewportWidth: number, game = false): number => {
  if (viewportWidth <= 560) return Math.max(320, Math.min(920, viewportWidth - 20));
  const controls = Math.min(
    340,
    Math.max(220, viewportWidth * 0.38),
    Math.max(184, viewportWidth * 0.6 - 150),
  );
  const gutters = 2 * Math.min(16, Math.max(8, viewportWidth * 0.013));
  const gap = Math.min(26, Math.max(24, viewportWidth * 0.02));
  const detailsMax = Math.min(330, Math.max(300, viewportWidth * 0.025 + 270));
  const details = Math.min(detailsMax, Math.max(184, viewportWidth * 0.22 - 27));
  const gameControls = Math.min(400, Math.max(244, viewportWidth * 0.36 - 102));
  const reserved =
    game && viewportWidth >= 980
      ? details + gameControls + gutters + 2 * gap
      : controls + gutters + gap;
  const maximum = Math.max(320, Math.min(920, viewportWidth - reserved));
  const preferred =
    viewportWidth < 1280
      ? Math.min(600, viewportWidth / 2)
      : Math.min(820, 600 + (viewportWidth - 1280) / 8);
  return Math.min(Math.max(516, Math.round(Math.max(320, preferred))), maximum);
};

export const analysisBoardStyle = (viewportWidth: number, game = false): CSSProperties =>
  ({
    "--analysis-board-size": `var(--board-user-size, min(${analysisBoardSize(viewportWidth, game)}px, calc(100dvh - var(--nav-height) - ${game ? 88 : 44}px)))`,
  }) as CSSProperties;
