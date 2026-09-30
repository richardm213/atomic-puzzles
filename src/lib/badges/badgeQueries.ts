import { queryOptions } from "@tanstack/react-query";

import { fetchBadgeSummary } from "./badges";

export const badgeSummaryQueryOptions = (username: string) =>
  queryOptions({
    queryKey: ["badges", "summary", username.toLowerCase()] as const,
    queryFn: () => fetchBadgeSummary(username),
    staleTime: 5 * 60 * 1_000,
  });
