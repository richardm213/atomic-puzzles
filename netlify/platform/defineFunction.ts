import { randomUUID } from "node:crypto";

import { errorResponse } from "./errors";
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

export const defineFunction =
  (route: FunctionRoute, definition: FunctionDefinition) =>
  async (event: FunctionEvent): Promise<FunctionResponse> => {
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

    try {
      return withPlatformHeaders(await route({ ...event, httpMethod: method }), requestId);
    } catch (error) {
      return withPlatformHeaders(errorResponse(error, definition.fallbackMessage), requestId);
    }
  };
