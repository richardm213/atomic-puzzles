import { OpeningExplorerQueueError } from "./requestQueue.js";

export type ExplorerNavigation = { session: string; sequence: number };

// The random session is per mounted explorer, never a user/account identifier.
export const parseExplorerNavigation = (
  session: string | undefined,
  sequence: string | undefined,
): ExplorerNavigation | undefined => {
  const value = Number(sequence);
  return session && /^[a-f0-9-]{36}$/i.test(session) && Number.isSafeInteger(value) && value > 0
    ? { session, sequence: value }
    : undefined;
};

export const awaitExplorerRequest = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new OpeningExplorerQueueError("Opening explorer request was cancelled.", 499),
      );
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    // Always observe the source promise, even if it was already cancelled.
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
};

// Coordination is process-local: warm Netlify invocations can supersede each
// other, but separate instances cannot. The legacy Netlify event has no browser
// disconnect signal; Vite supplies one. Deadlines bound abandoned queued work.
export const createExplorerRequestLifecycle = () => {
  const sessions = new Map<
    string,
    { sequence: number; controller: AbortController; expiresAt: number }
  >();
  const retainMs = 60_000;
  const maxSessions = 512;

  return (navigation?: ExplorerNavigation, disconnected?: AbortSignal) => {
    const controller = new AbortController();
    const now = Date.now();
    for (const [key, entry] of sessions) if (entry.expiresAt <= now) sessions.delete(key);
    if (navigation) {
      const previous = sessions.get(navigation.session);
      if (previous && previous.sequence >= navigation.sequence) {
        throw new OpeningExplorerQueueError(
          "Opening explorer request was superseded by a newer request.",
          409,
        );
      }
      previous?.controller.abort(
        new OpeningExplorerQueueError(
          "Opening explorer request was superseded by a newer request.",
          409,
        ),
      );
      sessions.delete(navigation.session);
      if (sessions.size >= maxSessions) {
        const oldest = sessions.keys().next().value;
        // Forget ordering only. Never cancel someone else's request to make room.
        if (oldest !== undefined) sessions.delete(oldest);
      }
      sessions.set(navigation.session, {
        sequence: navigation.sequence,
        controller,
        expiresAt: now + retainMs,
      });
    }
    const onDisconnect = () =>
      controller.abort(
        new OpeningExplorerQueueError("Opening explorer request was cancelled.", 499),
      );
    if (disconnected?.aborted) onDisconnect();
    else disconnected?.addEventListener("abort", onDisconnect, { once: true });
    const timeout = setTimeout(
      () =>
        controller.abort(new OpeningExplorerQueueError("Opening explorer request timed out.", 504)),
      15_000,
    );
    return {
      signal: controller.signal,
      release: () => {
        clearTimeout(timeout);
        controller.abort(new OpeningExplorerQueueError("Opening explorer request finished.", 499));
        disconnected?.removeEventListener("abort", onDisconnect);
      },
    };
  };
};
