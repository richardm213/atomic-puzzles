import { queryOptions } from "@tanstack/react-query";

import { fetchArchiveGame } from "../archive/games";

export const gameDetailQueryOptions = (gameId: string) =>
  queryOptions({
    queryKey: ["games", "detail", gameId] as const,
    queryFn: async ({ signal }) => {
      if (!gameId) throw new Error("Invalid game id.");
      const game = await fetchArchiveGame(gameId, signal);
      if (!game) throw new Error("Game not found.");
      return game;
    },
    staleTime: 10 * 60 * 1_000,
  });
