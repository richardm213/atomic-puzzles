// Positions adapted from public Lichess study chapters (linked per puzzle).
// The forcing lines are checked independently. Only position and move data are bundled.
export const GUEST_PUZZLES = [
  {
    fen: "r1bqk2r/pp1p3p/n1p1pppQ/8/1b1PP3/2N5/PPP2PPP/R1B1KB1R w KQkq - 2 3",
    goal: "Mate in one",
    solution: "3. Qf8#",
    source: "mxYOPgI3/DA4ZUgNR",
  },
  {
    fen: "rnbq1bnr/pppkN1pp/4pp2/3p4/8/8/PPPPPPPP/RNBQKB1R w KQ - 2 5",
    goal: "Mate in one",
    solution: "5. Nxc8#",
    source: "ctsm7KpT/ztjTbT6o",
  },
  {
    fen: "7k/1p1p3p/p5p1/8/8/6P1/PPPP1r1P/R1B3KR b - - 8 10",
    goal: "Mate in one",
    solution: "10... Rxh2#",
    source: "HzZGsmt4/WeJgp5vK",
  },
  {
    fen: "r1bq1bnr/pp3ppp/3k4/1B2p1B1/3P4/8/PPP2PPP/R2QK1NR w KQ - 3 5",
    goal: "Mate in one",
    solution: "5. dxe5#",
    source: "mxYOPgI3/FNaEyDky",
  },
  {
    fen: "r1bqkbnr/pppppp1p/2n3p1/7Q/8/4P3/PPPP1PPP/RNB1KBNR w KQkq - 0 2",
    goal: "Mate in two",
    solution: "2. Qd5 2... Nb4 3. Qxd7# (3. Qxf7#)",
    source: "mxYOPgI3/WzgsLJ5D",
  },
  {
    fen: "rnbqkb1r/pp2p1pp/2p4n/3p4/3P4/2N4P/PPP1PPP1/R1BQKB1R w KQkq - 0 1",
    goal: "Mate in two",
    solution: "1. Bg5 1... c5 2. Bxe7#",
    source: "mxYOPgI3/6YyaDvut",
  },
  {
    fen: "rnbqkbnr/pp3ppp/2p5/3pp3/B2PP3/8/PPP2PPP/RNBQK1NR b KQkq - 0 1",
    goal: "Trap the bishop",
    solution: "1... Na6 2. b4 Nxb4",
    source: "mxYOPgI3/iSzUUkrA",
  },
  {
    fen: "rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 0 1",
    goal: "Cover b5 and d5 with a pawn",
    solution: "1... c6 2. Nd5 cxd5",
    source: "ctsm7KpT/nPcG7KWs",
  },
  {
    fen: "r4rk1/p3p2p/4b1p1/1p6/P2p4/1P2P2P/2PP2P1/R1BK1B1R b q - 1 2",
    goal: "Mate in two",
    solution: "2... Rf2 3. Rb1 3... Rxd2#",
    source: "HzZGsmt4/Qgv1exV3",
  },
  {
    fen: "rnbqkb1r/ppppp2p/6pn/7Q/8/4P3/PPPP1PPP/RNB1KB1R w KQkq - 0 3",
    goal: "Mate in two",
    solution: "3. Qg5 3... Ng4 4. Qxe7#",
    source: "HzZGsmt4/gru5oEUt",
  },
  {
    fen: "rn1q1rk1/ppp3p1/3p4/8/3P4/8/PPP5/R3K2R w KQ - 0 2",
    goal: "Mate in two",
    solution: "2. Rh8+ 2... Kf7 3. Rxf8#",
    source: "KLtp8c6T/xpuxAXN4",
  },
  {
    fen: "rnbqkbnr/pp1pp1pp/2p2p2/8/8/4PN2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
    goal: "Set up a queen fork",
    solution: "1. Ne5 fxe5 2. Qh5+ g6 3. Qe5",
    source: "mxYOPgI3/GOvN6aca",
  },
  {
    fen: "r2q1bnr/3npk1p/p5p1/2pp1b2/Q7/1P1BP3/P1PP1PPP/R1B1K2R w KQ - 4 3",
    goal: "Mate in two",
    solution: "3. Qc6 3... c4 4. Qxg6#",
    source: "KLtp8c6T/DkVfxOlu",
  },
  {
    fen: "rn2k1nr/p1p1P1p1/7p/1pb1Np2/6b1/2P2PPN/PP5P/R4R1K b kq - 2 3",
    goal: "Mate in two",
    solution: "3... Bg1 4. Rab1 4... Bxh2#",
    source: "KLtp8c6T/kx1XOm8h",
  },
  {
    fen: "8/8/8/8/R7/8/p7/kK6 w - - 0 2",
    goal: "Mate in two",
    solution: "2. Kc1 (2. Kc2 2... Kb1 3. Rxa2#) 2... Kb1 3. Rxa2#",
    source: "wRLQk6Wq/K7Bl1MLH",
  },
  {
    fen: "r1b1Bbnr/4p2p/1p1pk1p1/q4p2/3P1P2/2N1P3/PPP3PP/R1B1K2R w KQ - 0 9",
    goal: "Mate in two",
    solution: "9. d5+ 9... Kf6 10. Bxg6#",
    source: "HzZGsmt4/MOsVjdwd",
  },
  {
    fen: "rnbqkbnr/ppppp1pp/8/5p2/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1",
    goal: "Mate in three",
    solution: "1. Ne5 1... d5 2. Nd7 2... d4 3. Nxf8#",
    source: "HzZGsmt4/8GeqOiQl",
  },
  {
    fen: "rnbqkbnr/p7/2pp1pp1/1p5p/1P6/3BPQ2/PBPP1PPP/RN2K2R w KQkq - 0 1",
    goal: "Mate in three",
    solution: "1. Qe4+ 1... Be6 2. Bxf6+ 2... Qe7 3. Qxe7#",
    source: "HzZGsmt4/QPVfSzKK",
  },
  {
    fen: "r1b1kb1r/1Npp2pp/p3pp2/8/8/4P3/PP1P1PPP/R1BK1B1R b kq - 0 1",
    goal: "Mate in three",
    solution: "1... Bb4 2. d3 2... Bd2 3. Rb1 3... Bxc1#",
    source: "KLtp8c6T/UMUTZnCd",
  },
  {
    fen: "rn2kb1r/p3p3/4b1pp/q1ppQ3/3P4/BP1BPP2/P1Pn2PP/R3K2R w KQkq - 0 1",
    goal: "Mate in three",
    solution: "1. Bb5+ 1... Qxb5 2. Qc7 2... Nb1 3. Qxe7#",
    source: "HzZGsmt4/XNsC91s8",
  },
] as const;
