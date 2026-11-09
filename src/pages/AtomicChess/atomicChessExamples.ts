import { TACTICAL_MOTIFS_PATH } from "../../../shared/seo";
import type { MotifExample } from "../PuzzleMotifs/motifExamples";

export type GuideExample = MotifExample & {
  name: string;
  sourceUrl: string;
  sourceName: string;
};

const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Public study positions and main lines; explanations below are our own.
// Keep the chapter links so readers can explore the original annotations and variations.
export const atomicChessExamples = {
  explosion: {
    name: "What disappears in an explosion",
    fen: "r1bqkbnr/pp1p3p/1Qn1ppp1/8/8/4P3/PPPP1PPP/RNB1KB1R b KQkq - 0 1",
    pgn: "1... axb6",
    note: "Play …axb6. The queen, the capturing pawn, and the knight on c6 disappear. The adjacent pawn on b7 survives, and the rook on a8 is outside the blast.",
    sourceUrl: "https://lichess.org/study/uf9GpQyI/kWUMaN4c",
    sourceName: "ijh — Atomic Rules",
  },
  enPassant: {
    name: "En passant can explode the king",
    fen: "8/2bpk3/8/4P3/8/8/3K3B/8 b - - 0 1",
    pgn: "1... d5 2. exd6#",
    note: "After …d5, White captures en passant on d6. The explosion is centered on d6, removing the bishop on c7 and the king on e7.",
    sourceUrl: "https://lichess.org/study/uf9GpQyI/jeaPy8pX",
    sourceName: "ijh — Atomic Rules",
  },
  queenFile: {
    name: "An early queen attack down the d-file",
    fen: start,
    pgn: "1. e4 d5 2. exd5 Qxd2#",
    note: "After exd5, both central pawns are gone. Black’s queen can go straight down the open d-file and capture d2, exploding the king on e1.",
    sourceUrl: "https://lichess.org/study/sRM1FScZ/7dehbuLv",
    sourceName: "Illion — New to nuke: Opening queen tactics",
  },
  queenAngles: {
    name: "The queen switches from h5 to d5",
    fen: start,
    pgn: "1. e4 Nc6 2. Qh5 g6 3. Qd5 d6 4. Qxf7#",
    note: "Blocking the first attack with …g6 does not end the danger. Qd5 attacks f7 and d7; …d6 leaves Qxf7 available.",
    sourceUrl: "https://lichess.org/study/sRM1FScZ/j3AnC30x",
    sourceName: "Illion — New to nuke: Opening queen tactics",
  },
  knight: {
    name: "A knight fork of the king’s neighboring pawns",
    fen: start,
    pgn: "1. Nf3 e6 2. Ne5 d5 3. Nxf7#",
    note: "Ne5 threatens both d7 and f7. Moving the d-pawn deals with only one target: Nxf7 still explodes the king on e8.",
    sourceUrl: "https://lichess.org/study/12TFMoys/bJuPUem6",
    sourceName: "Illion — New to nuke: Opening knight tactics",
  },
  sacrifice: {
    name: "A queen sacrifice opens the bishop’s attack",
    fen: "rnbqkb1r/p1p1p1pp/5n2/1p1p4/3P4/2NQ4/PPP1PPPP/R1B1KB1R w KQkq - 2 6",
    pgn: "6. Qg6+ hxg6 7. Bg5",
    note: "White gives up the queen to remove the h-pawn. After …hxg6, Bg5 threatens to capture e7 beside Black’s king. Look at the resulting threats before judging the material count.",
    sourceUrl: `${TACTICAL_MOTIFS_PATH}#sacrifice`,
    sourceName: "Atomic Puzzles — Sacrifice",
  },
  connectedKings: {
    name: "The defending king seeks contact",
    fen: "Q7/4k3/8/8/4K3/8/8/8 b - - 0 1",
    pgn: "1... Ke6 2. Ke3 Ke5 3. Ke2 Kd4 4. Kf1 Ke3 5. Kg1 Kf2",
    note: "Black follows the white king and keeps the kings connected. With only a queen to help, White cannot force them apart in this position.",
    sourceUrl: "https://lichess.org/study/ikJM4K3L/kzQcbhVZ",
    sourceName: "tipau — Atomic Endgames Level 1",
  },
  pawnRace: {
    name: "Winning a pawn race without capturing a pawn",
    fen: "8/8/7k/1p5P/1K6/8/8/8 w - - 0 1",
    pgn: "1. Ka3 b4+ 2. Kb3 Kg7 3. h6+ Kh7 4. Ka2 b3+ 5. Kb2 Kg8 6. h7+ Kh8 7. Ka1 b2+ 8. Kb1 Kg7 9. h8=Q+ Kg6 10. Qf6+ Kh5 11. Qg5#",
    note: "The kings cannot take the pawns. White blocks the b-pawn with the king, promotes the h-pawn, then uses the queen to mate.",
    sourceUrl: "https://lichess.org/study/ikJM4K3L/4vAYwWj9",
    sourceName: "tipau — Atomic Endgames Level 1",
  },
} satisfies Record<string, GuideExample>;

export type GuideExampleId = keyof typeof atomicChessExamples;
