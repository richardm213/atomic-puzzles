import { queryOptions } from "@tanstack/react-query";

import { normalizeUsername } from "../../utils/playerNames";
import { fetchPlayerRatingsRows } from "../archive/ratings";
import { isRegisteredSiteUser } from "../supabase/users";

const USERS_STALE_TIME_MS = 5 * 60 * 1_000;

export const userQueryKeys = {
  all: ["users"] as const,
  ratings: () => ["users", "ratings"] as const,
  registration: (username: string) => ["users", "registration", username] as const,
  aliasRegistration: (usernames: string[]) =>
    ["users", "alias-registration", ...usernames] as const,
};

const normalizeCandidateUsernames = (usernames: string[]): string[] => [
  ...new Set(usernames.map(normalizeUsername).filter(Boolean)),
];

export const userRatingsQueryOptions = () =>
  queryOptions({
    queryKey: userQueryKeys.ratings(),
    queryFn: () => fetchPlayerRatingsRows(),
    staleTime: USERS_STALE_TIME_MS,
  });

export const siteUserRegistrationQueryOptions = (username: string) =>
  queryOptions({
    queryKey: userQueryKeys.registration(username),
    queryFn: () => isRegisteredSiteUser(username),
    staleTime: USERS_STALE_TIME_MS,
  });

export const registeredSiteUsernameQueryOptions = (usernames: string[]) => {
  const candidates = normalizeCandidateUsernames(usernames);

  return queryOptions({
    queryKey: userQueryKeys.aliasRegistration(candidates),
    queryFn: async (): Promise<string | null> => {
      for (const username of candidates) {
        if (await isRegisteredSiteUser(username)) return username;
      }
      return null;
    },
    staleTime: USERS_STALE_TIME_MS,
  });
};
