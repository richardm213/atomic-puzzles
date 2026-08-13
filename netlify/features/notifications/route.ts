import { z } from "zod";

import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../platform/authentication";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { parseJsonBody } from "../../platform/validation";
import { NotificationRepository } from "./repository";
import { NotificationService } from "./service";

const notificationBodySchema = z.object({
  action: z.enum(["list", "count", "markRead", "delete"]),
  ids: z.array(z.number().int().positive()).optional(),
});

const mutationActions = new Set(["markRead", "delete"]);

export const notificationRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, notificationBodySchema, "Invalid notification request.");
  if (mutationActions.has(input.action)) {
    requireSameOrigin(event.headers, "Cross-site notification requests are not allowed.");
  }

  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Your Lichess login is no longer valid.");
  const service = new NotificationService(
    new NotificationRepository(createServerSupabase("Notification service")),
  );
  return identityResponse(identity, 200, await service.execute(input.action, username, input.ids));
};
