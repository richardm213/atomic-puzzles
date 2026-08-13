import { queryOptions } from "@tanstack/react-query";

import { fetchPlayerRatingsRows } from "../supabase/supabasePlayerRatings";
import { isRegisteredSiteUser } from "../supabase/supabaseUsers";

const USERS_STALE_TIME_MS = 5 * 60 * 1_000;

export const userQueryKeys = {
  all: ["users"] as const,
  ratings: () => ["users", "ratings"] as const,
  registration: (username: string) => ["users", "registration", username] as const,
};

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
