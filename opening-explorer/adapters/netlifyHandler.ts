import { randomUUID } from "node:crypto";

import { createRateLimiter, requestClientKey } from "../../netlify/platform/rateLimit.js";
import { parseExplorerNavigation } from "../core/requestLifecycle.js";
import { createOpeningExplorerService, type ExplorerServiceResponse } from "../core/service.js";
import { createTursoRepository } from "./tursoRepository.js";

export type NetlifyEvent = {
  httpMethod?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

const checkRateLimit = createRateLimiter({
  buckets: [
    { capacity: 90, refillPerSecond: 3 },
    { capacity: 900, refillPerSecond: 1.5 },
  ],
});

const repository = createTursoRepository();
const service = createOpeningExplorerService(repository);

const getHeader = (event: NetlifyEvent, name: string): string => {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (key.toLowerCase() === lowerName && value) return value;
  }
  return "";
};

const getClientIp = (event: NetlifyEvent): string => requestClientKey(event);

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
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
  body: JSON.stringify(body),
});

const requestIdFor = (event: NetlifyEvent): string => {
  const supplied = getHeader(event, "x-request-id") || getHeader(event, "x-nf-request-id");
  return /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
};

const finalize = (
  response: ExplorerServiceResponse,
  requestId: string,
): ExplorerServiceResponse => ({
  ...response,
  headers: {
    "X-Request-Id": requestId,
    "X-API-Version": "1",
    "X-Content-Type-Options": "nosniff",
    Link: '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    ...response.headers,
  },
});

export const createNetlifyOpeningExplorerHandler =
  (explorerService: Pick<typeof service, "handle"> = service) =>
  async (event: NetlifyEvent): Promise<ExplorerServiceResponse> => {
    const requestId = requestIdFor(event);
    const method = event.httpMethod ?? "GET";
    if (method === "OPTIONS") {
      return finalize(
        {
          statusCode: 204,
          headers: {
            Allow: "GET, OPTIONS",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-store",
          },
          body: "",
        },
        requestId,
      );
    }
    if (!isSameOriginRequest(event)) {
      return finalize(
        noStoreJson(403, {
          error: "Opening explorer requests must come from this site",
          code: "cross_site_request",
        }),
        requestId,
      );
    }

    const rateLimit = checkRateLimit(getClientIp(event));
    if (!rateLimit.allowed) {
      const response = noStoreJson(429, {
        error: "Too many opening explorer requests. Please wait and try again.",
        code: "rate_limited",
      });
      Object.assign(response.headers, rateLimit.headers, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
      return finalize(response, requestId);
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
      if (typeof value === "string") params.set(key, value);
    }
    const navigation = parseExplorerNavigation(
      getHeader(event, "x-explorer-session"),
      getHeader(event, "x-explorer-sequence"),
    );
    const response = await explorerService.handle({
      method,
      path: event.path ?? "/api/opening-explorer",
      params,
      intent: getHeader(event, "x-explorer-intent"),
      ...(navigation
        ? {
            navigation: { ...navigation, session: `${getClientIp(event)}:${navigation.session}` },
          }
        : {}),
    });
    if (!/\bpublic\b/i.test(response.headers["Cache-Control"] ?? "")) {
      response.headers = { ...rateLimit.headers, ...response.headers };
    }
    return finalize(response, requestId);
  };

export const handler = createNetlifyOpeningExplorerHandler();
