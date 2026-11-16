import type { Fixture } from "../../../shared/domain/marketAdmin";
import {
  tournamentGameScore,
  type TournamentScoreMatch,
} from "../../../shared/domain/tournamentGameScore";
import { queryArchiveResource } from "../../archive/queries";

export type ArchiveRow = {
  match_id: string;
  player_1: string;
  player_2: string;
  start_ts: number;
  mode: string;
  games: string[];
};
export const archiveDate = (row: ArchiveRow) =>
  new Date(Number(row.start_ts) * (Number(row.start_ts) < 10_000_000_000 ? 1000 : 1))
    .toISOString()
    .slice(0, 10);
export const archiveMatchesScore = (row: ArchiveRow, fixture: Fixture) => {
  const parsed: TournamentScoreMatch = {
    players: [row.player_1, row.player_2],
    games: row.games.map((entry, index) => {
      const [id, code, winnerSlot, whiteSlot] = entry.split(",");
      const white = whiteSlot === "2" ? row.player_2 : row.player_1;
      const black = whiteSlot === "2" ? row.player_1 : row.player_2;
      const winner =
        code === "w" || code === "white"
          ? "white"
          : code === "b" || code === "black"
            ? "black"
            : code === "d" || code === "draw" || winnerSlot === "0"
              ? "draw"
              : winnerSlot === (whiteSlot === "2" ? "2" : "1")
                ? "white"
                : winnerSlot === "1" || winnerSlot === "2"
                  ? "black"
                  : "draw";
      return { id: id!, game_index: index + 1, white, black, winner };
    }),
  };
  const final = parsed.games.at(-1);
  if (!final) return false;
  const score = tournamentGameScore(parsed, String(final.id), {
    ...fixture,
    p1: fixture.p1 ?? "",
    p2: fixture.p2 ?? "",
    outcome_type: "",
  });
  return (
    score?.scores.get((fixture.p1 ?? "").toLowerCase()) === fixture.s1 &&
    score?.scores.get((fixture.p2 ?? "").toLowerCase()) === fixture.s2
  );
};

export const findArchivedMatches = async (
  fixture: Fixture,
  mode: string,
  playedOn: string,
  matchId: string,
) => {
  const start = Date.parse(playedOn + "T00:00:00Z");
  const params = new URLSearchParams({
    resource: "matches",
    mode,
    pairA: fixture.p1 ?? "",
    pairB: fixture.p2 ?? "",
    startTs: String(start - 86400000),
    endTs: String(start + 2 * 86400000),
    pageSize: "200",
    includeTotal: "false",
  });
  const data = (
    process.env.TURSO_MATCHES_DATABASE_URL && process.env.TURSO_MATCHES_AUTH_TOKEN
      ? await queryArchiveResource(params)
      : await fetch(`https://atomicpuzzles.org/.netlify/functions/archive-data?${params}`, {
          signal: AbortSignal.timeout(15000),
        }).then(async (response) => {
          if (!response.ok) throw new Error("Unable to read the match archive");
          return response.json();
        })
  ) as { rows: ArchiveRow[] };
  const player = (name: string | null) => (name ?? "").trim().toLowerCase();
  const candidates = data.rows.filter(
    (row) =>
      row.mode === mode &&
      [row.player_1, row.player_2].map(player).sort().join("|") ===
        [fixture.p1, fixture.p2].map(player).sort().join("|") &&
      (fixture.outcome_type ? true : archiveMatchesScore(row, fixture)),
  );
  const requested = matchId || String(fixture.match_id ?? "");
  const selected =
    candidates.find((row) => row.match_id === requested) ??
    (requested ? undefined : candidates.length === 1 ? candidates[0] : undefined);
  return { candidates, selected };
};
