import { ArchiveRequestError, queryArchiveResource } from "../archive/queries";

type Event = {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": statusCode < 400 ? "public, max-age=60" : "no-store",
  },
  body: JSON.stringify(body),
});

export const handler = async (event: Event) => {
  if ((event.httpMethod ?? "GET") !== "GET") return json(405, { error: "Method not allowed" });
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters ?? {}).forEach(([key, value]) => {
    if (value !== undefined) params.append(key, value);
  });
  try {
    return json(200, await queryArchiveResource(params));
  } catch (error) {
    if (error instanceof ArchiveRequestError) return json(400, { error: error.message });
    return json(500, { error: "Archive query failed" });
  }
};
