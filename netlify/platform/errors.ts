import { type FunctionResponse, jsonResponse } from "./defineFunction";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const errorResponse = (error: unknown, fallbackMessage: string): FunctionResponse => {
  if (error instanceof HttpError) {
    return jsonResponse(error.statusCode, { error: error.message }, error.headers);
  }

  globalThis.console?.error(error);
  return jsonResponse(500, { error: fallbackMessage });
};
