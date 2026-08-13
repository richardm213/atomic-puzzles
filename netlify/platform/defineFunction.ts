import { errorResponse } from "./errors";

export type FunctionEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

export type FunctionResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type FunctionRoute = (event: FunctionEvent) => Promise<FunctionResponse>;

export type FunctionDefinition = {
  methods: readonly string[];
  fallbackMessage: string;
};

export const jsonResponse = (
  statusCode: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): FunctionResponse => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  },
  body: JSON.stringify(body),
});

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
