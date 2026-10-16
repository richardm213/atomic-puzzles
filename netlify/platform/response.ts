export type FunctionResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export const jsonResponse = (
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): FunctionResponse => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  },
  body: JSON.stringify(body),
});
