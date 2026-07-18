import { communityRequestSchema } from "../../../src/lib/community/schemas";
import { authenticateRequest } from "../../auth/identity";
import { createServerSupabase } from "../../database/supabase";
import { HttpError } from "../../http/errors";
import type { NetlifyEvent } from "../../http/handler";
import { jsonResponse } from "../../http/responses";
import { parseJsonBody } from "../../http/validation";
import { isSameOriginRequest } from "../../lib/siteSession";
import { CommunityRepository } from "./repository";
import { CommunityService, isPublicCommunityReadAction, readCommunityTarget } from "./service";

const mutationActions = new Set(["vote", "comment", "commentVote"]);

export const communityRoute = async (event: NetlifyEvent) => {
  const input = parseJsonBody(event, communityRequestSchema, "Invalid community request.");
  const publicRead = isPublicCommunityReadAction(input.action);
  if (mutationActions.has(input.action) && !isSameOriginRequest(event.headers)) {
    throw new HttpError(403, "Cross-site community requests are not allowed.");
  }

  const identity = await authenticateRequest(event.headers, publicRead);
  const respond = (statusCode: number, body: Record<string, unknown>) =>
    jsonResponse(statusCode, body, identity.setCookie ? { "Set-Cookie": identity.setCookie } : {});

  if (!identity.username && !publicRead) {
    throw new HttpError(
      401,
      identity.hadBearerToken
        ? "Your Lichess login is no longer valid."
        : "Log in with Lichess to participate.",
    );
  }

  const service = new CommunityService(
    new CommunityRepository(createServerSupabase("Community service")),
  );

  if (input.action === "profileKarma") {
    return respond(200, await service.loadProfileCommentKarma(input.username!));
  }

  if (input.action === "puzzleRankings") {
    return respond(200, await service.loadPuzzleRankings());
  }

  if (input.action === "communityUsers") {
    return respond(200, await service.loadCommunityUsers());
  }

  if (input.action === "profileComments" || input.action === "siteComments") {
    return respond(
      200,
      await service.loadProfileComments({
        profileUsername: input.action === "profileComments" ? input.username! : null,
        viewerUsername: identity.username,
        page: input.page ?? 1,
        pageSize: Math.min(100, input.pageSize ?? 25),
        sort: input.sort ?? "recent",
        targetFilter:
          input.action === "siteComments" && input.targetFilter && input.targetFilter !== "all"
            ? input.targetFilter
            : null,
      }),
    );
  }

  if (input.action === "load") {
    return respond(
      200,
      await service.loadTargetCommunity(
        { type: "puzzle", id: String(input.puzzleId!), context: "" },
        identity.username,
      ),
    );
  }

  if (input.action === "vote") {
    return respond(
      200,
      await service.voteOnPuzzle(input.puzzleId!, identity.username!, input.vote!),
    );
  }

  const parsedTarget = readCommunityTarget(input);
  if (!parsedTarget) throw new HttpError(400, "Invalid community request.");
  const target = await service.canonicalizeTarget(parsedTarget);

  if (input.action === "loadDiscussion") {
    return respond(200, await service.loadTargetCommunity(target, identity.username));
  }
  if (input.action === "commentVote") {
    return respond(
      200,
      await service.voteOnComment(target, input.commentId!, identity.username!, input.vote!),
    );
  }
  if (input.action === "comment") {
    return respond(
      201,
      await service.createComment(target, identity.username!, input.body!, input.parentId ?? null),
    );
  }

  throw new HttpError(400, "Invalid community request.");
};
