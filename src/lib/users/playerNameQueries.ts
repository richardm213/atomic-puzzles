import { queryOptions } from "@tanstack/react-query";

import { fetchPrimaryPlayerNicknames } from "../supabase/playerNicknames";

export const playerNameQueryKeys = {
  nicknames: ["player-nicknames"] as const,
};

export const playerNicknamesQueryOptions = () =>
  queryOptions({
    queryKey: playerNameQueryKeys.nicknames,
    queryFn: fetchPrimaryPlayerNicknames,
    staleTime: 5 * 60 * 1_000,
  });
