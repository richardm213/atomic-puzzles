import type { z } from "zod";

import type { FunctionEvent } from "./defineFunction";
import { HttpError } from "./errors";

const MAX_JSON_BODY_BYTES = 64 * 1024;

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

export const parseJsonBody = <Schema extends z.ZodType>(
  event: FunctionEvent,
  schema: Schema,
  message: string,
): z.output<Schema> => {
  const body = event.body ?? "";
  if (utf8ByteLength(body) > MAX_JSON_BODY_BYTES) {
    throw new HttpError(413, "Request body is too large.", {}, "payload_too_large", {
      maxBytes: MAX_JSON_BODY_BYTES,
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new HttpError(400, message, {}, "invalid_json");
  }

  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new HttpError(400, message, {}, "validation_failed", {
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
};
