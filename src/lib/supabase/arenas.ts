import { queryOptions } from "@tanstack/react-query";

import { getSupabaseClient } from "./client";
import type { AtomicArenaRow } from "./types";

export type Arena = Pick<
  AtomicArenaRow,
  "arena_id" | "name" | "frequency" | "starts_at" | "url" | "winner" | "score" | "players"
>;

export const getArenas = async (): Promise<Arena[]> => {
  const rows: Arena[] = [];
  // Page explicitly so the archive can grow beyond Supabase's response limit.
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await getSupabaseClient()
      .from("lichess_atomic_arenas")
      .select("arena_id,name,frequency,starts_at,url,winner,score,players")
      .order("starts_at", { ascending: false })
      .order("arena_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Unable to load the arena archive. Please try again.");
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
};

export const arenasQueryOptions = () =>
  queryOptions({
    queryKey: ["arena-archive"],
    queryFn: getArenas,
    staleTime: 5 * 60 * 1000,
  });

export const filterArenas = (arenas: Arena[], frequency: string, search: string): Arena[] => {
  const query = search.trim().toLowerCase();
  return arenas.filter(
    (arena) =>
      (frequency === "all" || arena.frequency === frequency) &&
      (!query || `${arena.name} ${arena.winner}`.toLowerCase().includes(query)),
  );
};

export const arenaHref = (arena: Arena): string => {
  // Restrict database-provided navigation to Lichess tournament pages.
  try {
    const url = new URL(arena.url);
    if (
      url.origin === "https://lichess.org" &&
      /^\/tournament\/[a-zA-Z0-9]+\/?$/.test(url.pathname)
    )
      return url.href;
  } catch {
    /* Use the canonical ID below. */
  }
  return `https://lichess.org/tournament/${encodeURIComponent(arena.arena_id)}`;
};
