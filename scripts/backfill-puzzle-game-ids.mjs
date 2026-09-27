import { makeFen } from "chessops/fen";
import { parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const ARCHIVE_URL = "https://atomicpuzzles.org/api/archive-data";
const LICHESS_EXPORT_URL = "https://lichess.org/api/games/export/_ids";
const PAGE_SIZE = 200;
const LICHESS_BATCH_SIZE = 250;
const ARCHIVE_LOOKUP_CONCURRENCY = 6;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required");
}
if (APPLY && !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required with --apply");
}

const canonicalAliases = new Map([
  ["max", "maxwellssilvrhammer"],
  ["randoom", "randoomplayer"],
  ["wolfram", "wolfram_ep"],
  ["seaside", "seaside_tiramisu"],
  ["noz", "neverofzero"],
  ["jsf", "jakestatefarm"],
  ["rkr", "rkrounit"],
  ["lesha", "lesha2002"],
  ["rabbie", "rabbier"],
  ["trash", "absolutelytrash"],
  ["trk", "ihatespammers"],
  ["qed", "queeneatingdragon"],
  ["unique_openings", "absolutelytrash"],
  ["beafraidofyourdesire", "maracker"],
  ["blackjack", "blackjack84"],
  ["quasa", "quasabianth"],
]);
const knownPuzzleSetMatchIds = new Map([
  [1, "tiPlLQEE"],
  [2, "fIJoCI7j"],
  [3, "cna1BteU"],
  [10, "Yr9V8s5R"],
  [11, "5xtZlERw"],
  [12, "OqWE65nu"],
  [13, "tUvUftLZ"],
  [14, "IJL3lXpE"],
  [15, "75L7QLTy"],
  [16, "Lx9Aw3eb"],
  [18, "irgn69Ce"],
  [19, "3OG5r1jh"],
  [31, "UhIDR1jR"],
  [32, "sHD4NH5z"],
  [33, "K2GJJJnb"],
  [37, "s1XjJvZ8"],
  [1496, "lOVW9Mod"],
]);

const canonicalPlayer = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return canonicalAliases.get(normalized) ?? normalized;
};

const comparableFen = (fen) =>
  String(fen ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
const pairKey = (white, black) => `${canonicalPlayer(white)}\0${canonicalPlayer(black)}`;

const requestJson = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.json();
};

const fetchPuzzles = async () => {
  const query = new URLSearchParams({
    select:
      "id,fen,solution,event_date,white_player,black_player,puzzle_set_id,puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(id,event_date,source_id)",
    white_player: "neq.",
    black_player: "neq.",
    order: "id.asc",
  });
  return requestJson(`${SUPABASE_URL}/rest/v1/puzzles?${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
};

const dateWindow = (eventDate) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate ?? "")) return {};
  const date = Date.parse(`${eventDate}T00:00:00Z`);
  return { startTs: date - 36 * 60 * 60 * 1000, endTs: date + 60 * 60 * 60 * 1000 };
};

const fetchCandidateMatches = async (puzzle) => {
  const eventDate = puzzle.puzzle_set?.event_date ?? "";
  const window = dateWindow(eventDate);
  const matchId =
    String(puzzle.puzzle_set?.source_id ?? "").trim() ||
    knownPuzzleSetMatchIds.get(Number(puzzle.puzzle_set_id)) ||
    "";
  const rows = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      resource: "matches",
      pairA: canonicalPlayer(puzzle.white_player),
      pairB: canonicalPlayer(puzzle.black_player),
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (matchId) query.set("matchId", matchId);
    if (!matchId && window.startTs) query.set("startTs", String(window.startTs));
    if (!matchId && window.endTs) query.set("endTs", String(window.endTs));
    const result = await requestJson(`${ARCHIVE_URL}?${query}`);
    rows.push(...result.rows);
    if (rows.length >= result.total || result.rows.length < PAGE_SIZE) return rows;
  }
};

const archiveGameId = (entry) => {
  const id = String(entry ?? "").split(",", 1)[0];
  return /^[A-Za-z0-9]{8}$/.test(id) ? id : "";
};

const utcDate = (timestamp) => {
  const date = new Date(Number(timestamp));
  return Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : "";
};

const positionsFromPgn = (pgn, gamePlayersById, wantedKeys) => {
  const positions = new Map();
  for (const game of parsePgn(pgn)) {
    const site = game.headers.get("Site") ?? "";
    const gameId = site.match(/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?$/)?.[1] ?? "";
    if (!gameId) continue;
    const start = startingPosition(game.headers);
    if (start.isErr) continue;
    const position = start.value;
    const archivePlayers = gamePlayersById.get(gameId);
    const white = archivePlayers?.white ?? canonicalPlayer(game.headers.get("White"));
    const black = archivePlayers?.black ?? canonicalPlayer(game.headers.get("Black"));
    const addPosition = (continuation = []) => {
      const fen = makeFen(position.toSetup());
      const keys = [
        `full\0${pairKey(white, black)}\0${fen}`,
        `position\0${pairKey(white, black)}\0${comparableFen(fen)}`,
      ];
      if (continuation.length > 0) {
        keys.push(`move\0${pairKey(white, black)}\0${comparableFen(fen)}\0${continuation[0]}`);
        for (let length = 2; length <= Math.min(10, continuation.length); length += 1) {
          keys.push(
            `line\0${pairKey(white, black)}\0${comparableFen(fen)}\0${continuation.slice(0, length).join("|")}`,
          );
        }
      }
      for (const key of keys) {
        if (!wantedKeys.has(key)) continue;
        const ids = positions.get(key) ?? new Set();
        ids.add(gameId);
        positions.set(key, ids);
      }
    };
    const mainline = [...game.moves.mainline()];
    for (const [index, node] of mainline.entries()) {
      addPosition(mainline.slice(index).map((entry) => normalizeSan(entry.san)));
      const move = parseSan(position, node.san);
      if (!move) break;
      position.play(move);
    }
    addPosition();
  }
  return positions;
};

const mergePositionIndexes = (target, source) => {
  for (const [key, ids] of source) {
    const existing = target.get(key) ?? new Set();
    ids.forEach((id) => existing.add(id));
    target.set(key, existing);
  }
};

const exportLichessGames = async (gameIds, gamePlayersById, wantedKeys) => {
  const positions = new Map();
  for (let offset = 0; offset < gameIds.length; offset += LICHESS_BATCH_SIZE) {
    const ids = gameIds.slice(offset, offset + LICHESS_BATCH_SIZE);
    const response = await fetch(`${LICHESS_EXPORT_URL}?clocks=false&evals=false&opening=false`, {
      method: "POST",
      headers: { Accept: "application/x-chess-pgn", "Content-Type": "text/plain" },
      body: ids.join(","),
    });
    if (!response.ok) {
      throw new Error(`Lichess export failed: ${response.status} ${await response.text()}`);
    }
    mergePositionIndexes(
      positions,
      positionsFromPgn(await response.text(), gamePlayersById, wantedKeys),
    );
    console.error(
      `Lichess export ${Math.min(offset + ids.length, gameIds.length)}/${gameIds.length}`,
    );
  }
  return positions;
};

const patchPuzzle = async ({ id, event_date, game_id, match_id }) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/puzzles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ event_date, game_id, match_id }),
  });
  if (!response.ok) throw new Error(`Puzzle ${id}: ${response.status} ${await response.text()}`);
};

const normalizeSan = (san) =>
  String(san ?? "")
    .trim()
    .replace(/^[0-9]+\.(?:\.\.)?/, "")
    .replace(/[!?+#]+$/g, "")
    .replaceAll("0", "O")
    .toLowerCase();

const solutionSans = (solution) => {
  const result = [];
  const tokens = String(solution ?? "")
    .replace(/\[[^\]]*\]/gs, " ")
    .replace(/\{[^}]*\}/gs, " ")
    .replace(/;[^\r\n]*/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/);
  for (const token of tokens) {
    const normalized = normalizeSan(token);
    if (normalized && !["*", "1-0", "0-1", "1/2-1/2", "..."].includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
};

const puzzleLookupKey = (puzzle) =>
  [
    ...[canonicalPlayer(puzzle.white_player), canonicalPlayer(puzzle.black_player)].sort(),
    puzzle.puzzle_set_id ?? "",
    puzzle.puzzle_set?.event_date ?? "",
  ].join("\0");

const puzzles = await fetchPuzzles();
const wantedPositionKeys = new Set();
for (const puzzle of puzzles) {
  const pair = pairKey(puzzle.white_player, puzzle.black_player);
  const fen = comparableFen(puzzle.fen);
  const solution = solutionSans(puzzle.solution);
  wantedPositionKeys.add(`full\0${pair}\0${puzzle.fen.trim()}`);
  wantedPositionKeys.add(`position\0${pair}\0${fen}`);
  if (solution[0]) wantedPositionKeys.add(`move\0${pair}\0${fen}\0${solution[0]}`);
  if (solution.length > 1) {
    wantedPositionKeys.add(`line\0${pair}\0${fen}\0${solution.slice(0, 10).join("|")}`);
  }
}
const lookupGroups = new Map();
for (const puzzle of puzzles) {
  const groupKey = puzzleLookupKey(puzzle);
  if (!lookupGroups.has(groupKey)) lookupGroups.set(groupKey, { puzzle, gameIds: new Set() });
}

const candidateGameIds = new Set();
const gamePlayersById = new Map();
const gameSourcesById = new Map();
const groups = [...lookupGroups.values()];
let completedArchiveLookups = 0;
for (let offset = 0; offset < groups.length; offset += ARCHIVE_LOOKUP_CONCURRENCY) {
  const batch = groups.slice(offset, offset + ARCHIVE_LOOKUP_CONCURRENCY);
  const batchMatches = await Promise.all(batch.map(({ puzzle }) => fetchCandidateMatches(puzzle)));
  batch.forEach((group, batchIndex) => {
    for (const match of batchMatches[batchIndex]) {
      for (const entry of match.games ?? []) {
        const id = archiveGameId(entry);
        if (id) {
          candidateGameIds.add(id);
          group.gameIds.add(id);
          gameSourcesById.set(id, {
            event_date: utcDate(match.start_ts),
            match_id: String(match.match_id ?? "").trim(),
          });
          const whiteSlot = String(entry).split(",")[3];
          gamePlayersById.set(
            id,
            whiteSlot === "2"
              ? {
                  white: canonicalPlayer(match.player_2),
                  black: canonicalPlayer(match.player_1),
                }
              : {
                  white: canonicalPlayer(match.player_1),
                  black: canonicalPlayer(match.player_2),
                },
          );
        }
      }
    }
  });
  completedArchiveLookups += batch.length;
  console.error(
    `Archive lookup ${completedArchiveLookups}/${groups.length}: ${candidateGameIds.size} games`,
  );
}

const positions = await exportLichessGames(
  [...candidateGameIds],
  gamePlayersById,
  wantedPositionKeys,
);
const matched = [];
const ambiguous = [];
const missing = [];
for (const puzzle of puzzles) {
  const allowedGameIds = lookupGroups.get(puzzleLookupKey(puzzle))?.gameIds ?? new Set();
  const allowed = (ids) => ids.filter((id) => allowedGameIds.has(id));
  const pair = pairKey(puzzle.white_player, puzzle.black_player);
  const solution = solutionSans(puzzle.solution);
  const lineIds =
    solution.length > 1
      ? allowed([
          ...(positions.get(
            `line\0${pair}\0${comparableFen(puzzle.fen)}\0${solution.slice(0, 10).join("|")}`,
          ) ?? []),
        ])
      : [];
  const move = solution[0] ?? "";
  const moveIds = allowed(
    move ? [...(positions.get(`move\0${pair}\0${comparableFen(puzzle.fen)}\0${move}`) ?? [])] : [],
  );
  const exactIds = allowed([...(positions.get(`full\0${pair}\0${puzzle.fen.trim()}`) ?? [])]);
  const positionIds = allowed([
    ...(positions.get(`position\0${pair}\0${comparableFen(puzzle.fen)}`) ?? []),
  ]);
  const candidateScores = new Map();
  const addEvidence = (ids, weight) => {
    ids.forEach((id) => candidateScores.set(id, (candidateScores.get(id) ?? 0) + weight));
  };
  addEvidence(positionIds, 1);
  addEvidence(moveIds, 2);
  addEvidence(exactIds, 4);
  addEvidence(lineIds, 8);
  const rankedCandidates = [...candidateScores.entries()].sort(
    ([leftId, leftScore], [rightId, rightScore]) =>
      rightScore - leftScore || leftId.localeCompare(rightId),
  );
  const bestScore = rankedCandidates[0]?.[1] ?? 0;
  const ids = rankedCandidates.filter(([, score]) => score === bestScore).map(([id]) => id);
  if (ids.length === 1) {
    const game_id = ids[0];
    const source = gameSourcesById.get(game_id);
    if (source?.event_date && source.match_id) {
      matched.push({ id: puzzle.id, game_id, ...source });
    } else {
      missing.push({ id: puzzle.id, white: puzzle.white_player, black: puzzle.black_player });
    }
  } else if (ids.length > 1) ambiguous.push({ id: puzzle.id, game_ids: ids });
  else missing.push({ id: puzzle.id, white: puzzle.white_player, black: puzzle.black_player });
}

console.log(JSON.stringify({ matched, ambiguous, missing }, null, 2));
if (APPLY) {
  for (const [index, puzzle] of matched.entries()) {
    await patchPuzzle(puzzle);
    console.error(`Updated ${index + 1}/${matched.length}`);
  }
}
console.error(
  `${matched.length} matched, ${ambiguous.length} ambiguous, ${missing.length} missing${APPLY ? " and applied" : ""}`,
);
