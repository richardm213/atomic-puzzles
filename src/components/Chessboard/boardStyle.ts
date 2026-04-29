import type { CSSProperties } from "react";

import { getBoardThemeColors } from "../../context/AppSettings";

type Rgb = { r: number; g: number; b: number };

type BoardTextureEntry = {
  overlay?: string;
  blendMode?: string;
  backgroundImage?: string;
  size?: string;
};

type PieceRole = "pawn" | "bishop" | "knight" | "rook" | "queen" | "king";

const pieceCodes: Record<PieceRole, string> = {
  pawn: "P",
  bishop: "B",
  knight: "N",
  rook: "R",
  queen: "Q",
  king: "K",
};

const checkerboardSvg = (light: string, dark: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><rect width='8' height='8' fill='${light}'/><g fill='${dark}'><rect x='1' width='1' height='1'/><rect x='3' width='1' height='1'/><rect x='5' width='1' height='1'/><rect x='7' width='1' height='1'/><rect y='1' width='1' height='1'/><rect x='2' y='1' width='1' height='1'/><rect x='4' y='1' width='1' height='1'/><rect x='6' y='1' width='1' height='1'/><rect x='1' y='2' width='1' height='1'/><rect x='3' y='2' width='1' height='1'/><rect x='5' y='2' width='1' height='1'/><rect x='7' y='2' width='1' height='1'/><rect y='3' width='1' height='1'/><rect x='2' y='3' width='1' height='1'/><rect x='4' y='3' width='1' height='1'/><rect x='6' y='3' width='1' height='1'/><rect x='1' y='4' width='1' height='1'/><rect x='3' y='4' width='1' height='1'/><rect x='5' y='4' width='1' height='1'/><rect x='7' y='4' width='1' height='1'/><rect y='5' width='1' height='1'/><rect x='2' y='5' width='1' height='1'/><rect x='4' y='5' width='1' height='1'/><rect x='6' y='5' width='1' height='1'/><rect x='1' y='6' width='1' height='1'/><rect x='3' y='6' width='1' height='1'/><rect x='5' y='6' width='1' height='1'/><rect x='7' y='6' width='1' height='1'/><rect y='7' width='1' height='1'/><rect x='2' y='7' width='1' height='1'/><rect x='4' y='7' width='1' height='1'/><rect x='6' y='7' width='1' height='1'/></g></svg>`,
  )}")`;

const boardTextureAsset = (filename: string): string =>
  `url("${import.meta.env.BASE_URL}images/board-textures/${filename}")`;

const clampColorChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const parseHexColor = (value: string | null | undefined): Rgb | null => {
  const normalized = /^#([0-9a-f]{6})$/i.exec(value ?? "");
  if (!normalized) return null;
  const hex = normalized[1]!;

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
};

const toHexColor = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("")}`;

const mixHexColors = (base: string, target: string, amount: number): string => {
  const baseRgb = parseHexColor(base);
  const targetRgb = parseHexColor(target);
  if (!baseRgb || !targetRgb) return base;

  return toHexColor({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * amount,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * amount,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * amount,
  });
};

const toRgba = (hex: string, alpha: number): string => {
  const rgb = parseHexColor(hex);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const boardTextureConfig: Record<string, BoardTextureEntry> = {
  "blue-marble": {
    overlay:
      "radial-gradient(circle at 16% 20%, rgba(255, 255, 255, 0.35), transparent 32%), radial-gradient(circle at 84% 18%, rgba(255, 255, 255, 0.2), transparent 28%), linear-gradient(135deg, rgba(61, 91, 126, 0.26), rgba(255, 255, 255, 0.08) 30%, rgba(61, 91, 126, 0.2) 60%, transparent 100%)",
    blendMode: "soft-light, normal",
  },
  canvas: {
    overlay:
      "repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.1) 0 2px, rgba(120, 96, 53, 0.05) 2px 4px), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0 2px, rgba(120, 96, 53, 0.05) 2px 4px)",
    blendMode: "multiply, normal",
  },
  wood: { backgroundImage: boardTextureAsset("wood.jpg"), size: "cover" },
  wood2: { backgroundImage: boardTextureAsset("wood2.jpg"), size: "cover" },
  wood3: { backgroundImage: boardTextureAsset("wood3.jpg"), size: "cover" },
  wood4: { backgroundImage: boardTextureAsset("wood4.jpg"), size: "cover" },
  maple: { backgroundImage: boardTextureAsset("maple.jpg"), size: "cover" },
  maple2: { backgroundImage: boardTextureAsset("maple2.jpg"), size: "cover" },
  leather: { backgroundImage: boardTextureAsset("leather.jpg"), size: "cover" },
  marble: { backgroundImage: boardTextureAsset("marble.jpg"), size: "cover" },
  "green-plastic": {
    overlay:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.03) 32%, rgba(0, 0, 0, 0.1) 100%)",
    blendMode: "soft-light, normal",
  },
  metal: { backgroundImage: boardTextureAsset("metal.jpg"), size: "cover" },
  newspaper: {
    overlay:
      "repeating-linear-gradient(0deg, rgba(94, 82, 66, 0.08) 0 2px, transparent 2px 5px), radial-gradient(circle at 14% 20%, rgba(120, 109, 91, 0.09), transparent 26%)",
    blendMode: "multiply, normal",
  },
  "purple-diag": {
    overlay:
      "repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0 10px, rgba(70, 37, 106, 0.08) 10px 20px)",
    blendMode: "multiply, normal",
  },
  ic: {
    overlay:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.04) 45%, rgba(76, 177, 210, 0.16) 100%), repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0 8px, rgba(91, 188, 214, 0.08) 8px 18px)",
    blendMode: "screen, normal",
  },
};

export type BoardCssVars = CSSProperties & Record<`--cg-${string}`, string>;

export const buildBoardStyle = (
  boardTheme: string,
  customLightSquare: string,
  customDarkSquare: string,
  boardColorOverrideTheme: string,
  boardOverrideLightSquare: string,
  boardOverrideDarkSquare: string,
): BoardCssVars => {
  const palette = getBoardThemeColors(
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
  );
  const texture = boardTextureConfig[boardTheme];
  const lightCoordColor = mixHexColors(palette.light, "#000000", 0.45);
  const darkCoordColor = mixHexColors(palette.dark, "#ffffff", 0.72);
  const backgroundImage = texture?.backgroundImage
    ? texture.backgroundImage
    : texture?.overlay
      ? `${texture.overlay}, ${checkerboardSvg(palette.light, palette.dark)}`
      : checkerboardSvg(palette.light, palette.dark);

  return {
    "--cg-board-background-image": backgroundImage,
    "--cg-board-background-size":
      texture?.size ?? (texture?.overlay ? "100% 100%, 100% 100%" : "100% 100%"),
    "--cg-board-background-blend-mode": texture?.blendMode ?? "normal",
    "--cg-board-light-last-move": toRgba(mixHexColors(palette.light, "#7fd0ff", 0.35), 0.46),
    "--cg-board-dark-last-move": toRgba(mixHexColors(palette.dark, "#2a95ff", 0.2), 0.42),
    "--cg-board-coord-dark": lightCoordColor,
    "--cg-board-coord-light": darkCoordColor,
  };
};

export const buildPieceStyle = (pieceSet: string): BoardCssVars => {
  const pieceStyle: Record<string, string> = {};

  for (const [role, code] of Object.entries(pieceCodes)) {
    pieceStyle[`--cg-piece-white-${role}`] =
      `url("https://lichess1.org/assets/piece/${pieceSet}/w${code}.svg")`;
    pieceStyle[`--cg-piece-black-${role}`] =
      `url("https://lichess1.org/assets/piece/${pieceSet}/b${code}.svg")`;
  }

  return pieceStyle as BoardCssVars;
};
