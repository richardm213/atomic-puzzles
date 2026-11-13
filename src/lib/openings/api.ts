import { z } from "zod";

import { openingDocumentSchema } from "../../../shared/domain/openings/repertoire";
import { postApi } from "../api/postApi";

const summarySchema = z.object({
  id: z.string(),
  owner: z.string(),
  title: z.string(),
  description: z.string(),
  revision: z.number(),
  source_listing_id: z.string().nullable(),
  source_version: z.number().nullable(),
  listing: z.object({ id: z.string(), price: z.number(), version: z.number() }).nullable(),
  source: z
    .object({ id: z.string(), version: z.number(), author: z.string(), title: z.string() })
    .nullable(),
  update_available: z.boolean(),
});
const reviewSchema = z.object({
  known: z.boolean(),
  intervalDays: z.number(),
  nextDue: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  correct: z.number(),
  wrong: z.number(),
});
const copySchema = summarySchema.extend({
  document: openingDocumentSchema,
  progress: z.record(z.string(), reviewSchema),
});
const catalogSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    author: z.string(),
    price: z.number(),
    version: z.number(),
    line_count: z.number(),
  }),
);
export type OpeningCopy = z.infer<typeof copySchema>;
export type OpeningSummary = z.infer<typeof summarySchema>;
export type OpeningListing = z.infer<typeof catalogSchema>[number];
const request = async <T>(body: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> =>
  (
    await postApi("/api/openings", body, {
      schema: z.object({ result: schema }),
      errorMessage: "Unable to load opening training.",
      invalidMessage: "The opening service returned invalid data.",
    })
  ).result;
export const fetchOpeningLibrary = () => request({ action: "list" }, z.array(summarySchema));
export const fetchOpeningCatalog = () => request({ action: "catalog" }, catalogSchema);
export const fetchOpening = (id: string) => request({ action: "get", id }, copySchema);
export const changeOpening = (body: Record<string, unknown>) => request(body, copySchema);
