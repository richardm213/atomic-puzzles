import { type HttpResponse, jsonResponse } from "./responses";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const errorResponse = (error: unknown, fallbackMessage: string): HttpResponse => {
  if (error instanceof HttpError) {
    return jsonResponse(error.statusCode, { error: error.message });
  }
  return jsonResponse(500, {
    error: error instanceof Error ? error.message : fallbackMessage,
  });
};
