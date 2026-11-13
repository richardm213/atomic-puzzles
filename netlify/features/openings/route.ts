import { z } from "zod";

import {
  emptyReview,
  knownOpeningKeys,
  openingCards,
  type OpeningDocument,
  openingDocumentSchema,
  openingMoveUci,
  type OpeningProgress,
  scheduleOpeningReview,
  validateOpeningDocument,
} from "../../../shared/domain/openings/repertoire";
import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../platform/authentication";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { HttpError } from "../../platform/errors";
import { jsonResponse } from "../../platform/response";
import { parseJsonBody } from "../../platform/validation";

const id = z.string().uuid();
const metadata = {
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  document: openingDocumentSchema,
};
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("catalog") }).strict(),
  z.object({ action: z.literal("list") }).strict(),
  z.object({ action: z.literal("get"), id }).strict(),
  z.object({ action: z.literal("create"), id, ...metadata }).strict(),
  z
    .object({ action: z.literal("save"), id, revision: z.number().int().positive(), ...metadata })
    .strict(),
  z
    .object({
      action: z.literal("publish"),
      id,
      revision: z.number().int().positive(),
      price: z
        .number()
        .finite()
        .nonnegative()
        .max(999999999999)
        .refine(
          (n) => Math.abs(n * 1e6 - Math.round(n * 1e6)) < 0.001,
          "Use at most six decimal places.",
        ),
    })
    .strict(),
  z
    .object({
      action: z.literal("buy"),
      id,
      version: z.number().int().positive(),
      quotedPrice: z.number().finite().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      id,
      revision: z.number().int().positive(),
      confirmReplacement: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id,
      revision: z.number().int().positive(),
      card: z.string().max(300),
      move: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("known"),
      id,
      revision: z.number().int().positive(),
      lineId: z.string().max(100),
      ply: z.number().int().min(0).max(256),
      scope: z.enum(["position", "line", "prefix"]),
      known: z.boolean(),
    })
    .strict(),
]);

type OpeningCopy = { document: OpeningDocument; progress: OpeningProgress; revision: number };
export const openingsRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, schema, "Invalid opening request.");
  const db = createServerSupabase("Opening training");
  const call = async (username: string, action: string, payload: unknown) => {
    const { data, error } = await db.rpc("opening_command", {
      p_username: username,
      p_action: action,
      p_input: payload,
    });
    if (error) {
      if (/not found|not owned/i.test(error.message))
        throw new HttpError(404, "Opening not found.");
      if (/changed|revision|conflict/i.test(error.message))
        throw new HttpError(409, "This opening or its price changed. Reload before continuing.");
      if (/not enough coins/i.test(error.message))
        throw new HttpError(409, "You don’t have enough coins.");
      if (/cannot|invalid|empty|copy|publish|confirmation/i.test(error.message))
        throw new HttpError(400, error.message);
      throw new Error("Unable to update opening.");
    }
    return data;
  };
  if (input.action === "catalog")
    return jsonResponse(200, { result: await call("", "catalog", {}) });
  if (!["get", "list"].includes(input.action))
    requireSameOrigin(event.headers, "Cross-site opening changes are not allowed.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(
    identity,
    "Log in to save or practice an opening.",
  ).toLowerCase();
  let payload: Record<string, unknown> = { ...input };
  if (input.action === "create" || input.action === "save") {
    try {
      const document = validateOpeningDocument(input.document);
      payload = { ...payload, document, cardKeys: openingCards(document).map((c) => c.key) };
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Invalid opening moves.");
    }
  }
  if (input.action === "known" || input.action === "review") {
    const copy = (await call(username, "get", { id: input.id })) as OpeningCopy;
    if (copy.revision !== input.revision)
      throw new HttpError(409, "This opening changed. Reload it first.");
    if (input.action === "known") {
      const keys = knownOpeningKeys(copy.document, input.scope, input.lineId, input.ply);
      payload = { ...payload, keys, state: { ...emptyReview(), known: input.known } };
    } else {
      const cards = openingCards(copy.document, "essential");
      const card = cards.find((c) => c.key === input.card);
      if (!card)
        throw new HttpError(400, "Only essential moves can receive spaced-repetition progress.");
      if (!openingMoveUci(card.fen, input.move)) throw new HttpError(400, "Invalid training move.");
      const validAlternative = cards.some(
        (c) => c.positionKey === card.positionKey && c.move === input.move,
      );
      if (validAlternative && input.move !== card.move)
        return identityResponse(identity, 200, { result: copy, validAlternative: true });
      const previous = copy.progress[card.key];
      payload = {
        ...payload,
        previous: previous ?? null,
        state: scheduleOpeningReview(previous, card.move === input.move, Date.now()),
      };
    }
  }
  return identityResponse(identity, 200, { result: await call(username, input.action, payload) });
};
