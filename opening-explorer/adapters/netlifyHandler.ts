import { createOpeningExplorerService, type ExplorerServiceResponse } from "../core/service.js";
import { createTursoRepository } from "./tursoRepository.js";

export type NetlifyEvent = {
  httpMethod?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const repository = createTursoRepository();
const service = createOpeningExplorerService(repository);

const getHeader = (event: NetlifyEvent, name: string): string => {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === lowerName && value) return value;
  }
  return "";
};

const getClientIp = (event: NetlifyEvent): string => {
  const netlifyIp = getHeader(event, "x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp;
  const forwardedFor = getHeader(event, "x-forwarded-for");
  return forwardedFor
    ? forwardedFor.split(",")[0]?.trim() || "unknown"
    : getHeader(event, "client-ip") || "unknown";
};

const isSameOriginRequest = (event: NetlifyEvent): boolean => {
  if (getHeader(event, "sec-fetch-site").toLowerCase() === "cross-site") return false;
  const origin = getHeader(event, "origin");
  const host = getHeader(event, "host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const noStoreJson = (statusCode: number, body: unknown): ExplorerServiceResponse => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const checkRateLimit = (clientIp: string, now = Date.now()) => {
  const current = rateLimits.get(clientIp);
  if (!current || current.resetAt <= now) {
    rateLimits.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
  }
  current.count += 1;
  return null;
};

export const createNetlifyOpeningExplorerHandler =
  (explorerService: Pick<typeof service, "handle"> = service) =>
  async (event: NetlifyEvent): Promise<ExplorerServiceResponse> => {
    const method = event.httpMethod ?? "GET";
    if (method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }
    if (!isSameOriginRequest(event)) {
      return noStoreJson(403, { error: "Opening explorer requests must come from this site" });
    }

    const retryAfter = checkRateLimit(getClientIp(event));
    if (retryAfter !== null) {
      const response = noStoreJson(429, {
        error: "Too many opening explorer requests. Please wait and try again.",
      });
      response.headers["Retry-After"] = String(retryAfter);
      return response;
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
      if (typeof value === "string") params.set(key, value);
    }
    return explorerService.handle({
      method,
      path: event.path ?? "/api/opening-explorer",
      params,
      intent: getHeader(event, "x-explorer-intent"),
    });
  };

export const handler = createNetlifyOpeningExplorerHandler();
