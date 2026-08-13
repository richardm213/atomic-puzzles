import type { z } from "zod";

import type { FunctionEvent } from "./defineFunction";
import { HttpError } from "./errors";

export const parseJsonBody = <Schema extends z.ZodType>(
  event: FunctionEvent,
  schema: Schema,
  message: string,
): z.output<Schema> => {
  try {
    const parsed = schema.safeParse(JSON.parse(event.body ?? ""));
    if (parsed.success) return parsed.data;
  } catch {
    // Malformed JSON and structurally invalid input intentionally share one public error.
  }
  throw new HttpError(400, message);
};
