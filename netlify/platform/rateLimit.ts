import type { FunctionEvent } from "./defineFunction";

export type TokenBucketPolicy = {
  capacity: number;
  refillPerSecond: number;
};

export type RateLimitPolicy = {
  buckets: readonly TokenBucketPolicy[];
  cost?: number | ((event: FunctionEvent) => number);
  message?: string;
};

type BucketState = {
  tokens: number;
  updatedAt: number;
};

type ClientState = {
  buckets: BucketState[];
  lastSeenAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  headers: Record<string, string>;
  retryAfterSeconds: number;
};

export const DEFAULT_API_RATE_LIMIT: RateLimitPolicy = {
  // A normal page may fan out several requests at once. The first bucket permits
  // that burst; the second limits sustained automated traffic to about 60/minute.
  buckets: [
    { capacity: 60, refillPerSecond: 3 },
    { capacity: 600, refillPerSecond: 1 },
  ],
};

const MAX_TRACKED_CLIENTS = 5_000;
const CLIENT_IDLE_TTL_MS = 30 * 60 * 1_000;

const getHeader = (headers: FunctionEvent["headers"], name: string): string => {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === target && value) return value.trim();
  }
  return "";
};

export const requestClientKey = (event: Pick<FunctionEvent, "headers">): string => {
  const netlifyIp = getHeader(event.headers, "x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp;

  // Netlify supplies x-nf-client-connection-ip in production. These fallbacks
  // keep local adapters and other trusted reverse proxies protected as well.
  const clientIp = getHeader(event.headers, "client-ip");
  if (clientIp) return clientIp;
  const forwardedFor = getHeader(event.headers, "x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return "unknown";
};

const normalizeCost = (value: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.min(100, Math.ceil(value))) : 1;

export const requestRateLimitCost = (policy: RateLimitPolicy, event: FunctionEvent): number =>
  normalizeCost(typeof policy.cost === "function" ? policy.cost(event) : (policy.cost ?? 1));

export const createRateLimiter = (policy: RateLimitPolicy) => {
  const clients = new Map<string, ClientState>();
  let checks = 0;

  const prune = (now: number): void => {
    if (++checks % 256 !== 0 && clients.size < MAX_TRACKED_CLIENTS) return;
    for (const [key, state] of clients) {
      if (state.lastSeenAt + CLIENT_IDLE_TTL_MS <= now) clients.delete(key);
    }
    while (clients.size >= MAX_TRACKED_CLIENTS) {
      const oldestKey = clients.keys().next().value;
      if (oldestKey === undefined) break;
      clients.delete(oldestKey);
    }
  };

  return (clientKey: string, cost = 1, now = Date.now()): RateLimitDecision => {
    prune(now);
    const normalizedCost = normalizeCost(cost);
    const existing = clients.get(clientKey);
    const bucketStates = policy.buckets.map((bucket, index) => {
      const previous = existing?.buckets[index];
      if (!previous) return { tokens: bucket.capacity, updatedAt: now };
      const elapsedSeconds = Math.max(0, now - previous.updatedAt) / 1_000;
      return {
        tokens: Math.min(
          bucket.capacity,
          previous.tokens + elapsedSeconds * bucket.refillPerSecond,
        ),
        updatedAt: now,
      };
    });

    let retryAfterSeconds = 0;
    policy.buckets.forEach((bucket, index) => {
      const state = bucketStates[index]!;
      if (state.tokens >= normalizedCost) return;
      const missing = normalizedCost - state.tokens;
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        Math.ceil(missing / Math.max(bucket.refillPerSecond, Number.EPSILON)),
      );
    });

    const allowed = retryAfterSeconds === 0;
    if (allowed) bucketStates.forEach((state) => (state.tokens -= normalizedCost));
    clients.delete(clientKey);
    clients.set(clientKey, { buckets: bucketStates, lastSeenAt: now });

    const sustainedPolicy = policy.buckets.at(-1)!;
    const sustainedState = bucketStates.at(-1)!;
    const headers = {
      "RateLimit-Limit": String(sustainedPolicy.capacity),
      "RateLimit-Remaining": String(Math.max(0, Math.floor(sustainedState.tokens))),
      "RateLimit-Reset": String(
        Math.max(
          1,
          Math.ceil(
            (sustainedPolicy.capacity - sustainedState.tokens) /
              Math.max(sustainedPolicy.refillPerSecond, Number.EPSILON),
          ),
        ),
      ),
    };
    return { allowed, headers, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  };
};
