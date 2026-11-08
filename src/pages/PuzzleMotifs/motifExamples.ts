export type MotifExample = { fen: string; pgn: string; note?: string };

// Standalone teaching positions: a starting FEN and a playable main line.
export const motifExamples: Readonly<Record<string, MotifExample | undefined>> = {
  advanced_pawn: {
    fen: "r2qk3/ppp5/n5pP/3pp3/3PP3/5P1b/PPP3P1/RN2KB1R w KQq - 1 12",
    pgn: "12. Bb5+ c6 13. h7",
  },
  queen_angles: {
    fen: "r1bqkbnr/ppppp1pp/5p2/8/8/4P3/PPPP1PPP/RNBQKB1R w KQkq - 0 4",
    pgn: "4. Qh5+ g6 5. Qd5 d6 6. Qf7+ Kd7 7. Qxe7#",
    note: "After …g6 blocks the check on h5, the queen changes angles with Qd5.",
  },
  coercion: {
    fen: "rn3r1k/2p3pp/3bp3/pp1p4/3P2b1/N1P2N2/PP4PP/R2QKB1R b KQ - 0 12",
    pgn: "12... Bg3+ 13. Kd2 Bf4+",
  },
  diagonal_clearance: {
    fen: "r1b1k2r/pp6/2p3pp/5pN1/1b1Pn2q/4PPPP/PP6/R1BQ1K1R w kq - 1 15",
    pgn: "15. Qb3 Be6 16. Nxe6",
  },
  file_clearance: {
    fen: "rnbqkbn1/p1p3p1/8/1p1p1pN1/7r/2NQ4/PPP1PPPP/R3KB1R w KQq - 1 8",
    pgn: "8. Qe3+ Re4 9. Nxd5+",
  },
  square_clearance: {
    fen: "4kb1r/1pp1p1pp/3q1p2/3p1n2/3PP3/7P/PPP2P2/R1BQKB1R b KQk - 0 8",
    pgn: "8... Ne3 9. Bxe3 Qf4",
  },
  fork: {
    fen: "rnb2rk1/pp1p3p/2p1p1p1/1B6/1b1nPP2/2PP2PP/PP6/R1BQ1RK1 b - - 0 14",
    pgn: "14... Ne2+ 15. Kh1 Nxc1",
  },
  epaulette_fork: {
    fen: "rn1qkbnr/p1p3p1/7p/1p1pppN1/3PP1b1/2N2P2/PPP3PP/R1BQKB1R w KQkq - 0 7",
    pgn: "7. Ne6",
  },
  zwischenzug: {
    fen: "r1b1kb1r/pppp4/4p1p1/8/8/2PP1QP1/PP3P2/R4K2 b kq - 0 13",
    pgn: "13... Bc5 14. d4 Rh2",
  },
  knight_invasion: {
    fen: "rnbqkb1r/pppppppp/8/8/6n1/5P1N/PPPPP1PP/RNBQKB1R w KQkq - 3 3",
    pgn: "3. Ng5 f6 4. Nf7",
  },
  bishop_invasion: {
    fen: "rnbqk1nr/7p/p1p1pppb/3p4/3N2Q1/3PP3/PPPB1PPP/RN2KB1R w KQkq - 0 1",
    pgn: "1. Ba5",
  },
  rook_invasion: {
    fen: "3r4/5k1p/3bp3/4P3/3P1n2/BPP4P/5R2/7K b - - 0 26",
    pgn: "26... Rg8",
  },
  castling_rook_invasion: {
    fen: "r6r/pp1k1ppp/n1p5/4n3/2B2B2/2P2P2/P3N1PP/4K2R w K - 3 9",
    pgn: "9. O-O",
  },
  trident: {
    fen: "rnbqkb1r/ppppp1pp/5p1n/8/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 1 3",
    pgn: "3. Ne5 fxe5 4. Bg5",
  },
  sacrifice: {
    fen: "rnbqkb1r/p1p1p1pp/5n2/1p1p4/3P4/2NQ4/PPP1PPPP/R1B1KB1R w KQkq - 2 6",
    pgn: "6. Qg6+ hxg6 7. Bg5",
  },
  material: {
    fen: "rnb2rk1/pp1p3p/2p1p1p1/1B6/1b1nPP2/2PP2PP/PP6/R1BQ1RK1 b - - 0 14",
    pgn: "14... Ne2+ 15. Kh1 Nxc1",
  },
  draw: {
    fen: "5k2/4R3/1p3P2/pP5p/P1p4P/2K5/8/6q1 w - - 2 30",
    pgn: "30. Re8+ Kf7 31. Re7+ Kf8 32. Re8+ Kf7 33. Re7+ Kf8",
  },
  blocking: {
    fen: "3rk2b/p7/4P1p1/2B2pPp/8/8/P6P/1K3R2 w - - 1 23",
    pgn: "23. Bd6",
  },
  king_walk: {
    fen: "8/4b3/4Pk2/5P2/p7/P7/7p/7K b - - 1 47",
    pgn: "47... Kg7 48. f6+ Kg8 49. fxe7 Kf8 50. e7+ Ke8",
  },
  pin: {
    fen: "rnbqk1nr/ppp3pp/4p3/4Pp2/1bP2P2/2Np1NP1/PP1P3P/R1BQKB1R b KQkq - 2 7",
    pgn: "7... Qd4",
  },
  unpinning: {
    fen: "rnbqk1nr/pp3ppp/2p5/1Bbp4/4P3/N3B3/PPP2PPP/R2QK1NR b KQkq - 3 6",
    pgn: "6... Qh4 7. g3 dxe4",
  },
  tempo: {
    fen: "rnb1k1nr/p7/2p2pp1/2q4p/1Q1P3N/2P1pP2/PP4PP/R1B1K2R w KQkq - 4 14",
    pgn: "14. Qb7 Bxb7 15. dxc5",
  },
  discovered_mate: {
    fen: "2kr1b2/pp1b4/8/4p1p1/PP4P1/8/1BPN1P2/2KR4 b - - 1 17",
    pgn: "17... Bf5 18. c3 Rxd2#",
  },
  rook_mate: {
    fen: "2r4k/5R2/1p2p2p/p2pP1pP/P2P2P1/2p5/8/6K1 w - - 0 26",
    pgn: "26. Rg7 c2 27. Rg8+",
  },
  bishop_knight_mate: {
    fen: "r3k3/p5p1/n3p3/3n1pB1/1PPP4/6P1/5P1P/1KbR1B1R b q - 0 17",
    pgn: "17... Nc3+ 18. Ka1 Bb2#",
  },
  king_blockade: {
    fen: "5k2/8/p7/Pp3p2/3P4/1P3Pp1/3b2P1/3K4 b - - 0 23",
    pgn: "23... Ke7 24. d5 Kd6",
  },
  square: {
    fen: "2r4k/5R2/1p2p2p/p2pP1pP/P2P2P1/2p5/8/6K1 w - - 0 26",
    pgn: "26. Rg7 c2 27. Rg8+",
  },
  explosion_mate_threat: {
    fen: "r5k1/1ppn4/p5pp/3p1q2/4p2Q/N1PP4/PP4PN/5R1K b - - 6 20",
    pgn: "20... Qh3 21. Qxh3 Nf6",
  },
  exposed_king: {
    fen: "r3kb1r/pp4pp/n3pp2/8/3P4/5N2/PP3PPP/R3KB1R b KQkq - 0 9",
    pgn: "9... Bb4+ 10. Kd1 Rc8",
  },
  explosion_defense: {
    fen: "rn3r1k/pp6/2p4p/3p4/3P3P/8/PPP1pR2/4R1K1 w - - 0 23",
    pgn: "23. Rg2 Rf1+ 24. Rexe2",
  },
  development: {
    fen: "4k2r/p1p3p1/3p4/3P4/7P/2P5/PP6/RN2K3 w Qk - 0 17",
    pgn: "17. Nd2 O-O 18. O-O-O",
  },
  stuck_pawn: {
    fen: "r5k1/pp5p/n1p5/3pp3/1b1P3P/2N5/PPP5/2KR4 b - - 1 17",
    pgn: "17... Ba3 18. bxa3 Nb4",
    note: "White’s own knight blocks the c2-pawn, so it can’t move out of the way of …Nxc2#.",
  },
  stuck_piece: {
    fen: "r3kbnr/1p4pp/p1npp3/qB4B1/3PP3/2P2P2/PP4PP/R2QK2R w KQkq - 2 11",
    pgn: "11. Be7",
  },
  pawn_endgame: {
    fen: "8/4k3/4P3/8/3p4/3K4/8/8 w - - 0 1",
    pgn: "1. Ke2 d3+ 2. Kd2 Kd8 3. e7+ Ke8 4. Ke1 d2+ 5. Kd1 Kd7 6. e8=Q+",
  },
};
