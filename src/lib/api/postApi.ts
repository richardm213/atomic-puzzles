import { appAssetPath } from "../../utils/appAssetPath";
import { invalidateLichessSessionForResponse } from "../auth/lichessAuth";

type ApiSchema<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
};

type ApiMessage = string | ((response: Response) => string);

export type ApiRequestOptions<T> = {
  errorMessage: ApiMessage;
  invalidMessage?: string;
  schema?: ApiSchema<T>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

type PostApiOptions<T> = Omit<ApiRequestOptions<T>, "method" | "body">;

type ApiErrorBody = {
  error?: unknown;
  code?: unknown;
  details?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string,
    readonly details?: unknown,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const apiError = (value: unknown, fallback: string): string => {
  if (value && typeof value === "object" && "error" in value) {
    const message = Reflect.get(value, "error");
    if (typeof message === "string" && message) return message;
  }
  return fallback;
};

const retryAfterMilliseconds = (response: Response): number => {
  const value = response.headers.get("Retry-After")?.trim() ?? "";
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
};

export const apiRequest = async <T = unknown>(
  path: string,
  {
    errorMessage,
    invalidMessage,
    schema,
    signal,
    timeoutMs = 30_000,
    headers = {},
    method = "GET",
    body,
  }: ApiRequestOptions<T>,
): Promise<T> => {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Timed out", "TimeoutError")),
    timeoutMs,
  );

  let response: Response;
  try {
    const hasBody = body !== undefined;
    response = await fetch(appAssetPath(path), {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new ApiError("The request timed out. Please try again.", 0, "request_timeout", "");
    }
    if (signal?.aborted) throw error;
    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      0,
      "network_error",
      "",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
  invalidateLichessSessionForResponse(response);

  const result: unknown = await response.json().catch(() => null);
  const fallback = typeof errorMessage === "function" ? errorMessage(response) : errorMessage;
  if (!response.ok) {
    const errorBody = (result && typeof result === "object" ? result : {}) as ApiErrorBody;
    throw new ApiError(
      apiError(result, fallback),
      response.status,
      typeof errorBody.code === "string" ? errorBody.code : "request_failed",
      response.headers.get("X-Request-Id") ?? "",
      errorBody.details,
      retryAfterMilliseconds(response),
    );
  }

  if (schema) {
    const parsed = schema.safeParse(result);
    if (!parsed.success) {
      throw new ApiError(
        invalidMessage ?? "The server returned invalid data.",
        response.status,
        "invalid_response",
        response.headers.get("X-Request-Id") ?? "",
      );
    }
    return parsed.data;
  }
  if (result === null && invalidMessage) {
    throw new ApiError(
      invalidMessage,
      response.status,
      "invalid_response",
      response.headers.get("X-Request-Id") ?? "",
    );
  }
  return result as T;
};

export const postApi = <T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options: PostApiOptions<T>,
): Promise<T> => apiRequest(path, { ...options, method: "POST", body });
