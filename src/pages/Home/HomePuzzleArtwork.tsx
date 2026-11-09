import { parseFen } from "chessops/fen";
import type { Role } from "chessops/types";
import { squareFile, squareRank } from "chessops/util";
import { useId } from "react";

import {
  type BoardSquareColors,
  getBoardThemeColors,
  getDefaultBoardTheme,
  type Theme,
  useAppSettings,
} from "../../context/AppSettings";
import { appAssetPath } from "../../utils/appAssetPath";

const FENS = {
  ruby: {
    primary: "r1b1k2r/pp6/2p3pp/5pN1/1b1Pn2q/4PPPP/PP6/R1BQ1K1R w kq - 1 15",
    secondary: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
  },
  emerald: {
    primary: "1k1r4/pp1b1Rpp/2ppp3/1B6/1b1P3P/2N5/PPP5/6K1 w - - 3 20",
    secondary: "3r4/5k1p/3bp3/4P3/3P1n2/BPP4P/5R2/7K b - - 0 26",
  },
  amethyst: {
    primary: "rnbqk1nr/pp3ppp/2p5/1Bbp4/4P3/N3B3/PPP2PPP/R2QK1NR b KQkq - 3 6",
    secondary: "r5k1/1ppn4/p5pp/3p1q2/4p2Q/N1PP4/PP4PN/5R1K b - - 6 20",
  },
  black: {
    primary: "r1bqk2r/ppp3p1/4p2p/3p4/1b1P4/P1N5/1P3PP1/R1BQKB1R w KQkq - 0 11",
    secondary: "rn3r1k/pp6/2p4p/3p4/3P3P/8/PPP1pR2/4R1K1 w - - 0 23",
  },
} satisfies Record<Exclude<Theme, "default">, { primary: string; secondary: string }>;

const PIECE_CODES: Record<Role, string> = {
  pawn: "P",
  knight: "N",
  bishop: "B",
  rook: "R",
  queen: "Q",
  king: "K",
};
const PIECE_SPRITE = appAssetPath("/images/home-puzzles/cburnett.svg");
const PREVIEWS = [
  { side: "secondary", cardClass: "homePuzzlePreviewSecondary" },
  { side: "primary", cardClass: "homePuzzlePreviewPrimary" },
] as const;

const PuzzleDiagram = ({
  fen,
  flipped,
  colors,
}: {
  fen: string;
  flipped: boolean;
  colors: BoardSquareColors;
}) => {
  const checkerboard = useId();
  const { board } = parseFen(fen).unwrap();

  return (
    <svg className="homePuzzleDiagram" viewBox="0 0 360 360" focusable="false">
      <defs>
        <pattern id={checkerboard} width="90" height="90" patternUnits="userSpaceOnUse">
          <rect width="90" height="90" fill={colors.light} />
          <path d="M45 0h45v45H45zM0 45h45v45H0z" fill={colors.dark} />
        </pattern>
      </defs>
      <rect width="360" height="360" fill={`url(#${checkerboard})`} />
      {Array.from(board, ([square, piece]) => {
        const file = squareFile(square);
        const rank = squareRank(square);
        const color = piece.color === "white" ? "w" : "b";

        return (
          <use
            key={square}
            href={`${PIECE_SPRITE}#${color}${PIECE_CODES[piece.role]}`}
            x={(flipped ? 7 - file : file) * 45}
            y={(flipped ? rank : 7 - rank) * 45}
            width="45"
            height="45"
          />
        );
      })}
    </svg>
  );
};

export const HomePuzzleArtwork = () => {
  const { theme, colorMode } = useAppSettings();
  const colors = getBoardThemeColors(
    getDefaultBoardTheme(theme),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    colorMode,
  );

  return (
    <div className="homePuzzlePreview" aria-hidden="true">
      {PREVIEWS.map(({ side, cardClass }) => (
        <div key={side} className={`homePuzzlePreviewCard ${cardClass}`}>
          {theme === "default" ? (
            <img
              src={appAssetPath(`/images/home-puzzles/home-board-${colorMode}-${side}.png`)}
              alt=""
              width="832"
              height="832"
              decoding="async"
            />
          ) : (
            <PuzzleDiagram fen={FENS[theme][side]} flipped={side === "secondary"} colors={colors} />
          )}
        </div>
      ))}
    </div>
  );
};
