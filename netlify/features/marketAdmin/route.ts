import { z } from "zod";

import { marketResolutionInputSchema } from "../../../shared/domain/marketAdmin";
import { PUZZLE_ADMIN_USERNAME } from "../../../shared/domain/puzzles/puzzleAdmin";
import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../platform/authentication";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { HttpError } from "../../platform/errors";
import { parseJsonBody } from "../../platform/validation";
import { MarketAdminRepository } from "./repository";
import { MarketAdminService } from "./service";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("preview"), input: marketResolutionInputSchema }),
  z.object({
    action: z.literal("resolve"),
    input: marketResolutionInputSchema,
    version: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
export const marketAdminRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site market administration is not allowed.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in to administer markets.");
  if (username !== PUZZLE_ADMIN_USERNAME) throw new HttpError(403, "This page is restricted.");
  const input = parseJsonBody(event, requestSchema, "Invalid market resolution request.");
  const service = new MarketAdminService(
    new MarketAdminRepository(createServerSupabase("Market administration")),
    username,
  );
  const result =
    input.action === "list"
      ? await service.list()
      : input.action === "preview"
        ? await service.preview(input.input)
        : await service.resolve(input.input, input.version);
  return identityResponse(identity, 200, { result });
};
