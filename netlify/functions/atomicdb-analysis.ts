type Event = {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

const ATOMIC_DB_QUERY_URL = "https://belzedar.duckdns.org/atomicdb/api/query";
const MAX_FEN_LENGTH = 160;

const json = (statusCode: number, body: unknown, cache = false) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": cache ? "public, max-age=30, stale-while-revalidate=120" : "no-store",
  },
  body: JSON.stringify(body),
});

export const handler = async (event: Event) => {
  if ((event.httpMethod ?? "GET") !== "GET") return json(405, { error: "Method not allowed" });

  const fen = event.queryStringParameters?.fen?.trim() ?? "";
  if (!fen || fen.length > MAX_FEN_LENGTH || fen.split(/\s+/).length < 4) {
    return json(400, { error: "A valid FEN is required." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const url = new URL(ATOMIC_DB_QUERY_URL);
    url.searchParams.set("fen", fen);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return json(502, { error: "AtomicDB returned an invalid response." });
    }

    if (response.status === 404)
      return json(404, { error: "Position not found in AtomicDB." }, true);
    if (!response.ok) return json(502, { error: "AtomicDB analysis is unavailable." });
    if (!body || typeof body !== "object" || !Array.isArray((body as { moves?: unknown }).moves)) {
      return json(502, { error: "AtomicDB returned an invalid response." });
    }
    const position = body as Record<string, unknown> & { moves: unknown[] };
    return json(
      200,
      {
        key: position.key,
        status: position.status,
        closure: position.closure,
        score: position.score,
        point: position.point,
        best_move: position.best_move,
        moves: position.moves.slice(0, 5),
      },
      true,
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "AtomicDB took too long to respond."
        : "AtomicDB analysis is unavailable.";
    return json(504, { error: message });
  } finally {
    clearTimeout(timeout);
  }
};
