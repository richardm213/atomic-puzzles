import type { z } from "zod";

import { HttpError } from "./errors";
import type { NetlifyEvent } from "./handler";

export const parseJsonBody = <Schema extends z.ZodType>(
  event: NetlifyEvent,
  schema: Schema,
  message: string,
): z.output<Schema> => {
  try {
    const result = schema.safeParse(JSON.parse(event.body ?? ""));
    if (result.success) return result.data;
  } catch {
    // The public error deliberately does not distinguish malformed JSON from an invalid payload.
  }
  throw new HttpError(400, message);
};
