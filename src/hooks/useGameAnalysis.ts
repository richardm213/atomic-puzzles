import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { ignoreInitialGameAnalysisPlies } from "../../shared/domain/gameAnalysis";
import type { ArchiveGame } from "../lib/archive/games";
import { coinQueryKeys, updateCachedCoinBalance } from "../lib/coins/coinQueries";
import { fetchGameAnalysis, requestGameAnalysis } from "../lib/gameAnalysis/gameAnalysis";
import { preloadCompletedGameAnalysis } from "../lib/gameAnalysis/preload";

const queryKey = (gameId: string) => ["game-analysis", gameId] as const;
const WOLFRANDOM_RANDOMIZED_PLIES = 6;

export const useGameAnalysis = (
  game: ArchiveGame | null | undefined,
  initialFen: string,
  username: string,
) => {
  const queryClient = useQueryClient();
  const gameId = game?.game_id ?? "";
  const query = useQuery({
    queryKey: queryKey(gameId),
    queryFn: () => fetchGameAnalysis(gameId),
    enabled: Boolean(gameId),
    staleTime: 4_000,
    refetchInterval: (state) => {
      const analysis = state.state.data;
      return analysis && (analysis.status === "queued" || analysis.status === "processing")
        ? 5_000
        : false;
    },
  });
  const analysis = useMemo(() => {
    const record = query.data ?? null;
    if (game?.mode !== "wolfrandom" || !record?.result) return record;
    return {
      ...record,
      result: ignoreInitialGameAnalysisPlies(record.result, WOLFRANDOM_RANDOMIZED_PLIES),
    };
  }, [game?.mode, query.data]);
  useEffect(() => {
    preloadCompletedGameAnalysis(
      analysis,
      game?.mode === "wolfrandom" ? WOLFRANDOM_RANDOMIZED_PLIES : 0,
    );
  }, [analysis, game?.mode]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!game?.moves) throw new Error("This game does not have a complete move list.");
      return requestGameAnalysis(game.game_id, initialFen, game.moves);
    },
    onSuccess: ({ analysis, balance }) => {
      queryClient.setQueryData(queryKey(gameId), analysis);
      if (balance !== null && username) {
        updateCachedCoinBalance(queryClient, username, balance);
        void queryClient.invalidateQueries({ queryKey: coinQueryKeys.rankings });
      }
    },
  });

  return {
    analysis,
    isLoading: query.isPending,
    loadError: query.error,
    request: mutation.mutate,
    isRequesting: mutation.isPending,
    requestError: mutation.error,
  };
};
