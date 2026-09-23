const APPROVED_PUZZLE_CREATORS = new Set(["seaside_tiramisu", "wolfram_ep", "randoomplayer"]);

export const isApprovedPuzzleCreator = (username: string): boolean =>
  APPROVED_PUZZLE_CREATORS.has(username.trim().toLowerCase());
