import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { aliasesLookupQueryOptions } from "../lib/users/aliasQueries";
import { playerNicknamesQueryOptions } from "../lib/users/playerNameQueries";
import { normalizeUsername } from "../utils/playerNames";

export const usePlayerDisplayNames = (enabled = true) => {
  const aliasesQuery = useQuery({ ...aliasesLookupQueryOptions(), enabled });
  const nicknamesQuery = useQuery({ ...playerNicknamesQueryOptions(), enabled });
  const nicknames = useMemo(
    () =>
      new Map(
        (nicknamesQuery.data ?? []).map(({ username, nickname }) => [
          normalizeUsername(username),
          nickname,
        ]),
      ),
    [nicknamesQuery.data],
  );

  return useCallback(
    (value: string) => {
      const exact = value.trim();
      const normalized = normalizeUsername(exact);
      const identity = aliasesQuery.data?.get(exact) ?? aliasesQuery.data?.get(normalized);
      const username = normalizeUsername(identity?.primary ?? normalized);
      return { username, label: nicknames.get(username) || username };
    },
    [aliasesQuery.data, nicknames],
  );
};
