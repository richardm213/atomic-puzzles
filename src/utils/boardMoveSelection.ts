import type { AtomicDbResult } from "./atomicDb";

type DatabaseMove = {
  uci: string;
  games: number;
};

export const chooseDatabaseMove = <T extends DatabaseMove>(
  moves: readonly T[],
  mode: "popular" | "random" | "frequency",
  random = Math.random,
): T | null => {
  const firstMove = moves[0];
  if (!firstMove) return null;

  if (mode === "popular") {
    return moves.reduce((best, move) => (move.games > best.games ? move : best), firstMove);
  }

  if (mode === "random") {
    return moves[Math.floor(random() * moves.length)] ?? firstMove;
  }

  const totalGames = moves.reduce((total, move) => total + Math.max(0, move.games), 0);
  if (totalGames <= 0) {
    return moves[Math.floor(random() * moves.length)] ?? firstMove;
  }

  let roll = random() * totalGames;
  for (const move of moves) {
    roll -= Math.max(0, move.games);
    if (roll <= 0) return move;
  }

  return moves.at(-1) ?? firstMove;
};

type MoveSourceStatus = "idle" | "loading" | "ready" | "error";

export const selectSpacebarMove = ({
  engineEnabled,
  engineResult,
  engineStatus,
  databaseMoves,
  databaseStatus,
  fen,
}: {
  engineEnabled: boolean;
  engineResult: AtomicDbResult | null;
  engineStatus: MoveSourceStatus;
  databaseMoves: readonly DatabaseMove[];
  databaseStatus: MoveSourceStatus;
  fen: string;
}): string | null => {
  if (engineEnabled) {
    if (engineStatus !== "ready" || engineResult?.fen !== fen) return null;

    const position = engineResult.position;
    if (!position) return null;

    // AtomicDB returns moves in engine rank order; this is the same move shown at the top.
    return position.moves[0]?.uci ?? null;
  }

  if (databaseStatus !== "ready") return null;

  return chooseDatabaseMove(databaseMoves, "popular")?.uci ?? null;
};
