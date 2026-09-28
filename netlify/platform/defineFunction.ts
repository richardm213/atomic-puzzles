import { errorResponse } from "./errors";
import { type FunctionResponse, jsonResponse } from "./response";

export type FunctionEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

export type FunctionRoute = (event: FunctionEvent) => Promise<FunctionResponse>;

export type FunctionDefinition = {
  methods: readonly string[];
  fallbackMessage: string;
};

export const defineFunction =
  (route: FunctionRoute, definition: FunctionDefinition) =>
  async (event: FunctionEvent): Promise<FunctionResponse> => {
    if (!definition.methods.includes(event.httpMethod ?? "")) {
      return jsonResponse(405, { error: "Method not allowed." });
    }

    try {
      return await route(event);
    } catch (error) {
      return errorResponse(error, definition.fallbackMessage);
    }
  };
