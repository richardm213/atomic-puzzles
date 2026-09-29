import type { AtomicDbResult } from "./atomicDb";

type DatabaseMove = {
  uci: string;
  games: number;
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

    return (
      position.moves.find((move) => move.uci === position.bestMove)?.uci ??
      position.moves[0]?.uci ??
      null
    );
  }

  if (databaseStatus !== "ready") return null;

  return (
    databaseMoves.reduce<DatabaseMove | null>(
      (mostPopular, move) =>
        mostPopular === null || move.games > mostPopular.games ? move : mostPopular,
      null,
    )?.uci ?? null
  );
};
