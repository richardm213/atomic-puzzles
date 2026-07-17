import { appAssetPath } from "../../utils/appAssetPath";
import { invalidateLichessSessionForResponse } from "../auth/lichessAuth";

type ApiSchema<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
};

type ApiMessage = string | ((response: Response) => string);

type PostApiOptions<T> = {
  errorMessage: ApiMessage;
  invalidMessage?: string;
  schema?: ApiSchema<T>;
};

const apiError = (value: unknown, fallback: string): string => {
  if (value && typeof value === "object" && "error" in value) {
    const message = Reflect.get(value, "error");
    if (typeof message === "string" && message) return message;
  }
  return fallback;
};

export const postApi = async <T = unknown>(
  path: string,
  body: Record<string, unknown>,
  { errorMessage, invalidMessage, schema }: PostApiOptions<T>,
): Promise<T> => {
  const response = await fetch(appAssetPath(path), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  invalidateLichessSessionForResponse(response);

  const result: unknown = await response.json().catch(() => null);
  const fallback = typeof errorMessage === "function" ? errorMessage(response) : errorMessage;
  if (!response.ok) throw new Error(apiError(result, fallback));

  if (schema) {
    const parsed = schema.safeParse(result);
    if (!parsed.success) throw new Error(invalidMessage ?? "The server returned invalid data.");
    return parsed.data;
  }
  if (result === null && invalidMessage) throw new Error(invalidMessage);
  return result as T;
};
