import { errorResponse } from "./errors";
import { type HttpResponse, jsonResponse } from "./responses";

export type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type Route = (event: NetlifyEvent) => Promise<HttpResponse>;

export const postJsonHandler =
  (route: Route, fallbackMessage: string) =>
  async (event: NetlifyEvent): Promise<HttpResponse> => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." });
    }

    try {
      return await route(event);
    } catch (error) {
      return errorResponse(error, fallbackMessage);
    }
  };
