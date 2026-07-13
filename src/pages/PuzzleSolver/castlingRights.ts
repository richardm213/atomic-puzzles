type CastlingRights = {
  black: string[];
  white: string[];
};

export const castlingRightsFromFen = (fen: string | null | undefined): CastlingRights => {
  const rights = fen?.trim().split(/\s+/)[2] ?? "-";

  return {
    white: [rights.includes("K") ? "O-O" : "", rights.includes("Q") ? "O-O-O" : ""].filter(Boolean),
    black: [rights.includes("k") ? "O-O" : "", rights.includes("q") ? "O-O-O" : ""].filter(Boolean),
  };
};
