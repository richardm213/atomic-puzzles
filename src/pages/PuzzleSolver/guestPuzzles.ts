// Mate-in-one positions from Lichess's CC0 Atomic games export, not our puzzle catalog:
// https://huggingface.co/datasets/Lichess/atomic-chess-games
export const GUEST_PUZZLES = [
  {
    // https://lichess.org/FSYpSUNk
    fen: "rnbqk1nr/pppp1ppp/8/4p3/1b2P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 2 3",
    solution: "3. Qxf7#",
  },
  {
    // https://lichess.org/QrzXwZlm
    fen: "3qkb1r/p1pppppp/8/8/4n3/4P3/PPPP1PPP/RNBQK1NR b KQk - 0 3",
    solution: "3... Nxf2# (3... Nxd2#)",
  },
  {
    // https://lichess.org/TnuLcjdw
    fen: "rnb1k1nr/pppp1ppp/8/8/1b6/4P3/PPPB1PPP/RN1QKBNR b KQkq - 2 4",
    solution: "4... Bxd2#",
  },
  {
    // https://lichess.org/31SahQPS
    fen: "r1bqk3/ppp1pp1p/2n5/8/4P3/1P6/P2P1PPP/RN1QKBNR b KQq - 0 5",
    solution: "5... Qxd2#",
  },
  {
    // https://lichess.org/p43P7FzL
    fen: "r1bq1k1r/ppppp2p/2n2p2/7Q/3PP3/2P5/PP3PPP/RN2KB1R w KQ - 2 8",
    solution: "8. Qf7#",
  },
] as const;
