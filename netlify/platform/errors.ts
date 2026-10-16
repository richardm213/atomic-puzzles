import { type FunctionResponse, jsonResponse } from "./response";

const defaultErrorCode = (statusCode: number): string => {
  if (statusCode === 400) return "invalid_request";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 404) return "not_found";
  if (statusCode === 405) return "method_not_allowed";
  if (statusCode === 409) return "conflict";
  if (statusCode === 413) return "payload_too_large";
  if (statusCode === 429) return "rate_limited";
  if (statusCode === 503) return "service_unavailable";
  if (statusCode >= 500) return "internal_error";
  return "request_failed";
};

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly headers: Record<string, string> = {},
    readonly code = defaultErrorCode(statusCode),
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const errorResponse = (error: unknown, fallbackMessage: string): FunctionResponse => {
  if (error instanceof HttpError) {
    return jsonResponse(
      error.statusCode,
      {
        error: error.message,
        code: error.code,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      error.headers,
    );
  }

  globalThis.console?.error(error);
  return jsonResponse(500, { error: fallbackMessage, code: "internal_error" });
};
