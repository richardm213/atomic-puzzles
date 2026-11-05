const LOCK_NAME = "atomic-puzzles.atomic-stockfish";
const CLAIM_STORAGE_KEY = `${LOCK_NAME}.claim`;
const tabId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

type LeaseClaim = { type: "claim"; tabId: string; claimedAt: number };

export type AtomicStockfishLease = { release: () => void };

let revokeHeldLease: (() => void) | null = null;

const handleClaim = (claim: LeaseClaim): void => {
  if (claim.type !== "claim" || claim.tabId === tabId) return;
  revokeHeldLease?.();
};

const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(LOCK_NAME);
if (channel) {
  channel.addEventListener("message", (event: MessageEvent<LeaseClaim>) => handleClaim(event.data));
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== CLAIM_STORAGE_KEY || !event.newValue) return;
    try {
      handleClaim(JSON.parse(event.newValue) as LeaseClaim);
    } catch {
      // Ignore malformed values written outside this coordinator.
    }
  });
  window.addEventListener("blur", () => revokeHeldLease?.());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") revokeHeldLease?.();
  });
}

const waitUntilCurrentTab = async (): Promise<void> => {
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  await new Promise<void>((resolve) => {
    const check = (): void => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      resolve();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
  });
};

const announceClaim = (): void => {
  const claim: LeaseClaim = { type: "claim", tabId, claimedAt: Date.now() };
  channel?.postMessage(claim);
  try {
    window.localStorage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(claim));
  } catch {
    // BroadcastChannel and Web Locks still coordinate when storage is unavailable.
  }
};

export const acquireAtomicStockfishLease = async (
  onRevoked: () => void | Promise<void>,
): Promise<AtomicStockfishLease> => {
  if (!navigator.locks) {
    throw new Error("Atomic-Stockfish requires browser support for cross-tab locking");
  }

  await waitUntilCurrentTab();
  announceClaim();

  return new Promise<AtomicStockfishLease>((resolve, reject) => {
    void navigator.locks
      .request(LOCK_NAME, async () => {
        let released = false;
        let resolveRelease: (() => void) | null = null;
        const hold = new Promise<void>((holdResolve) => {
          resolveRelease = holdResolve;
        });
        const release = (): void => {
          if (released) return;
          released = true;
          resolveRelease?.();
        };
        const revoke = (): void => {
          if (released) return;
          void Promise.resolve(onRevoked()).finally(release);
        };
        revokeHeldLease = revoke;
        resolve({ release });
        await hold;
        if (revokeHeldLease === revoke) revokeHeldLease = null;
      })
      .catch(reject);
  });
};
