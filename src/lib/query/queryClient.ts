import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Route modules are already preloaded on intent. Keep their data around as well so moving
      // between archive/ranking pages (or using Back) paints from memory instead of rebuilding
      // the same database view after React Query's short default garbage-collection window.
      gcTime: 30 * 60 * 1_000,
      retry: 1,
      staleTime: 30_000,
      // A tab-focus refresh competes with the first click/keypress after returning to the site.
      // Mutations explicitly invalidate affected data and stale queries still refresh on mount.
      refetchOnWindowFocus: false,
    },
  },
});
