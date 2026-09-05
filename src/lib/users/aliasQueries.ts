import { queryOptions } from "@tanstack/react-query";

import { type AliasIdentityRow, fetchAliasRows, fetchProfileAliasRow } from "../archive/aliases";
import { loadAliasesLookup } from "./aliasesLookup";

const ALIASES_STALE_TIME_MS = 5 * 60 * 1_000;

export const aliasQueryKeys = {
  all: ["aliases"] as const,
  lookup: () => ["aliases", "lookup"] as const,
  bannedUsers: () => ["aliases", "banned-users"] as const,
  identity: (username: string) => ["aliases", "identity", username] as const,
};

export const aliasesLookupQueryOptions = () =>
  queryOptions({
    queryKey: aliasQueryKeys.lookup(),
    queryFn: loadAliasesLookup,
    staleTime: Number.POSITIVE_INFINITY,
  });

export const aliasRowsQueryOptions = () =>
  queryOptions({
    queryKey: aliasQueryKeys.bannedUsers(),
    queryFn: fetchAliasRows,
    staleTime: ALIASES_STALE_TIME_MS,
  });

export const profileAliasQueryOptions = (username: string) =>
  queryOptions<AliasIdentityRow | null>({
    queryKey: aliasQueryKeys.identity(username),
    queryFn: () => fetchProfileAliasRow(username),
    staleTime: ALIASES_STALE_TIME_MS,
  });
