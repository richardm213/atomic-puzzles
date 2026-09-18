import { useCallback, useMemo } from "react";

import {
  buildOpeningExplorerUrl,
  type ExplorerRequestNavigation,
  fetchExplorerApiResponse,
} from "../utils/openingExplorer";
import { useOpeningExplorer } from "./useOpeningExplorer";

// A separate hook instance gives leaders independent cancellation, navigation
// sequencing, caching and loading state. Leaders are unfiltered position-wide data.
export const useOpeningPositionLeaders = (fen: string, enabled: boolean) => {
  const url = useMemo(
    () => buildOpeningExplorerUrl({ fen, speeds: [0, 1, 2], part: "leaders" }),
    [fen],
  );
  const request = useCallback(
    (signal: AbortSignal, navigation: ExplorerRequestNavigation) =>
      fetchExplorerApiResponse(url, "visible", signal, navigation).then((response) => ({
        response,
      })),
    [url],
  );
  const { response, status } = useOpeningExplorer({
    enabled,
    fen,
    cacheKey: url,
    debounceMs: 250,
    playerColor: "white",
    showPerformance: false,
    request,
  });
  return enabled && status === "ready" ? (response?.positionLeaders ?? null) : null;
};
