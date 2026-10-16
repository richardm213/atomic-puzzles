import { ArchiveRequestError, queryArchiveResource } from "../archive/queries";
import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { HttpError } from "../platform/errors";
import { jsonResponse } from "../platform/response";

const archiveDataRoute = async (event: FunctionEvent) => {
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters ?? {}).forEach(([key, value]) => {
    if (value !== undefined) params.append(key, value);
  });
  try {
    return jsonResponse(200, await queryArchiveResource(params), {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    });
  } catch (error) {
    if (error instanceof ArchiveRequestError) {
      throw new HttpError(400, error.message, {}, "invalid_archive_query");
    }
    throw error;
  }
};

export const handler = defineFunction(archiveDataRoute, {
  methods: ["GET"],
  fallbackMessage: "Archive query failed",
});
