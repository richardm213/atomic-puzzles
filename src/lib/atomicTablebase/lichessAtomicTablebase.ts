import { z } from "zod";

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const LICHESS_ATOMIC_TABLEBASE_URL = "https://tablebase.lichess.ovh/atomic";

const tablebaseCategorySchema = z.enum([
  "win",
  "unknown",
  "syzygy-win",
  "maybe-win",
  "cursed-win",
  "draw",
  "blessed-loss",
  "maybe-loss",
  "syzygy-loss",
  "loss",
]);

const tablebaseMoveSchema = z.object({
  uci: z.string().regex(UCI_PATTERN),
  category: tablebaseCategorySchema,
  dtz: z.number().nullable(),
  precise_dtz: z.number().nullable().optional(),
  dtm: z.number().nullable().optional(),
  zeroing: z.boolean().optional(),
  checkmate: z.boolean(),
  stalemate: z.boolean(),
  variant_win: z.boolean(),
  variant_loss: z.boolean(),
});

const atomicTablebaseSchema = z.object({
  category: tablebaseCategorySchema,
  dtz: z.number().nullable(),
  precise_dtz: z.number().nullable().optional(),
  dtm: z.number().nullable().optional(),
  checkmate: z.boolean(),
  stalemate: z.boolean(),
  variant_win: z.boolean(),
  variant_loss: z.boolean(),
  moves: z.array(tablebaseMoveSchema),
});

export type AtomicTablebaseResponse = z.infer<typeof atomicTablebaseSchema>;

type CacheEntry<Value> = { value: Value; expiresAt: number };

const CACHE_TTL_MS = 2 * 60_000;
const MAX_CACHE_ENTRIES = 128;
const probeCache = new Map<string, CacheEntry<AtomicTablebaseResponse>>();

const readCache = <Value>(cache: Map<string, CacheEntry<Value>>, fen: string): Value | null => {
  const entry = cache.get(fen);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(fen);
    return null;
  }
  cache.delete(fen);
  cache.set(fen, entry);
  return entry.value;
};

const writeCache = <Value>(
  cache: Map<string, CacheEntry<Value>>,
  fen: string,
  value: Value,
): void => {
  cache.delete(fen);
  cache.set(fen, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
};

const fetchTablebase = async <Result>(
  fen: string,
  schema: z.ZodType<Result>,
  signal?: AbortSignal,
): Promise<Result> => {
  const url = new URL(LICHESS_ATOMIC_TABLEBASE_URL);
  url.searchParams.set("fen", fen);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Atomic tablebase returned ${response.status}.`);

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Atomic tablebase returned an invalid response.");
  return parsed.data;
};

export const probeAtomicTablebase = async (
  fen: string,
  signal?: AbortSignal,
): Promise<AtomicTablebaseResponse> => {
  const cached = readCache(probeCache, fen);
  if (cached) return cached;
  const result = await fetchTablebase(fen, atomicTablebaseSchema, signal);
  writeCache(probeCache, fen, result);
  return result;
};
