import { type Client, createClient } from "@libsql/client/web";

let archiveClient: Client | null = null;

export const getArchiveClient = (): Client => {
  if (archiveClient) return archiveClient;

  const url = process.env.TURSO_MATCHES_DATABASE_URL?.trim() ?? "";
  const authToken = process.env.TURSO_MATCHES_AUTH_TOKEN?.trim() ?? "";
  if (!url || !authToken) {
    throw new Error("Turso match archive credentials are not configured");
  }

  archiveClient = createClient({ url, authToken });
  return archiveClient;
};
