import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { parseJsonBody } from "../../../platform/validation";
import { customPuzzleSetBodySchema } from "./model";
import { CustomPuzzleSetRepository } from "./repository";
import { CustomPuzzleSetService } from "./service";

const publicReadActions = new Set(["list", "get", "attempts"]);

export const puzzleSetsRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(
    event,
    customPuzzleSetBodySchema,
    "Invalid custom puzzle set request.",
  );
  if (!publicReadActions.has(input.action)) {
    requireSameOrigin(event.headers, "Cross-site custom-set requests are not allowed.");
  }

  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to use custom puzzle sets.");
  const service = new CustomPuzzleSetService(
    new CustomPuzzleSetRepository(createServerSupabase("Custom puzzle sets"), username),
  );
  const result = await service.execute(input);
  return identityResponse(identity, result.statusCode, result.body);
};
