import { randomUUID } from "node:crypto";

import { errorResponse } from "./errors";
import {
  createRateLimiter,
  DEFAULT_API_RATE_LIMIT,
  type RateLimitPolicy,
  requestClientKey,
  requestRateLimitCost,
} from "./rateLimit";
import { type FunctionResponse, jsonResponse } from "./response";

export type FunctionEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  path?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

export type FunctionRoute = (event: FunctionEvent) => Promise<FunctionResponse>;

export type FunctionDefinition = {
  methods: readonly string[];
  fallbackMessage: string;
  rateLimit?: RateLimitPolicy | false;
};

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

const requestIdFor = (event: FunctionEvent): string => {
  const headers = event.headers ?? {};
  const supplied =
    headers["x-request-id"] ??
    headers["X-Request-Id"] ??
    headers["x-nf-request-id"] ??
    headers["X-Nf-Request-Id"];
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
};

const withPlatformHeaders = (response: FunctionResponse, requestId: string): FunctionResponse => ({
  ...response,
  headers: {
    "X-Request-Id": requestId,
    "X-API-Version": "1",
    "X-Content-Type-Options": "nosniff",
    Link: '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
    ...response.headers,
  },
});

const withRateLimitHeaders = (
  response: FunctionResponse,
  headers: Record<string, string> | undefined,
): FunctionResponse =>
  headers && !/\bpublic\b/i.test(response.headers["Cache-Control"] ?? "")
    ? { ...response, headers: { ...headers, ...response.headers } }
    : response;

export const defineFunction = (route: FunctionRoute, definition: FunctionDefinition) => {
  const rateLimitPolicy =
    definition.rateLimit === false ? null : (definition.rateLimit ?? DEFAULT_API_RATE_LIMIT);
  const checkRateLimit = rateLimitPolicy ? createRateLimiter(rateLimitPolicy) : null;

  return async (event: FunctionEvent): Promise<FunctionResponse> => {
    const requestId = requestIdFor(event);
    const methods = [...new Set(definition.methods.map((method) => method.toUpperCase()))];
    const method = event.httpMethod?.toUpperCase() ?? "GET";
    const allow = [...methods, "OPTIONS"].join(", ");

    if (method === "OPTIONS") {
      return withPlatformHeaders(
        { statusCode: 204, headers: { Allow: allow, "Cache-Control": "no-store" }, body: "" },
        requestId,
      );
    }

    if (!methods.includes(method)) {
      return withPlatformHeaders(
        jsonResponse(
          405,
          { error: "Method not allowed.", code: "method_not_allowed" },
          { Allow: allow },
        ),
        requestId,
      );
    }

    const rateLimitDecision =
      checkRateLimit && rateLimitPolicy
        ? checkRateLimit(requestClientKey(event), requestRateLimitCost(rateLimitPolicy, event))
        : null;
    if (rateLimitDecision && !rateLimitDecision.allowed) {
      return withPlatformHeaders(
        jsonResponse(
          429,
          {
            error: rateLimitPolicy?.message ?? "Too many requests. Please wait and try again.",
            code: "rate_limited",
          },
          {
            ...rateLimitDecision.headers,
            "Retry-After": String(rateLimitDecision.retryAfterSeconds),
          },
        ),
        requestId,
      );
    }

    try {
      const response = await route({ ...event, httpMethod: method });
      return withPlatformHeaders(
        withRateLimitHeaders(response, rateLimitDecision?.headers),
        requestId,
      );
    } catch (error) {
      const response = errorResponse(error, definition.fallbackMessage);
      return withPlatformHeaders(
        withRateLimitHeaders(response, rateLimitDecision?.headers),
        requestId,
      );
    }
  };
};
