const PRELOAD_RELOAD_KEY = "atomic-puzzles:preload-reload";
const PRELOAD_RETRY_WINDOW_MS = 10_000;

type PreloadRecoveryOptions = {
  now?: () => number;
  reload?: () => void;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

export const recoverFromPreloadError = (
  event: Event,
  {
    now = Date.now,
    reload = () => window.location.reload(),
    storage = window.sessionStorage,
  }: PreloadRecoveryOptions = {},
) => {
  const currentTime = now();

  try {
    const storedReload = storage.getItem(PRELOAD_RELOAD_KEY);
    if (storedReload !== null) {
      const previousReload = Number(storedReload);
      if (
        Number.isFinite(previousReload) &&
        currentTime - previousReload < PRELOAD_RETRY_WINDOW_MS
      ) {
        return false;
      }
    }

    storage.setItem(PRELOAD_RELOAD_KEY, String(currentTime));
  } catch {
    // If session storage is unavailable, preserve the original import error.
    return false;
  }

  event.preventDefault();
  reload();
  return true;
};

export const installPreloadErrorRecovery = () => {
  window.addEventListener("vite:preloadError", recoverFromPreloadError);
};
