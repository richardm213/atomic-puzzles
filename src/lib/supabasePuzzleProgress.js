import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows, loadSupabasePage } from "./supabaseRows";
import { normalizeUsername } from "../utils/playerNames";

const PUZZLE_PROGRESS_RPC =
  import.meta.env.VITE_SUPABASE_PUZZLE_PROGRESS_RPC?.trim() || "record_first_puzzle_attempt";
const PUZZLE_PROGRESS_TABLE =
  import.meta.env.VITE_SUPABASE_PUZZLE_PROGRESS_TABLE?.trim() || "puzzle_progress";
const PUZZLE_PROGRESS_PAGE_RPC =
  import.meta.env.VITE_SUPABASE_PUZZLE_PROGRESS_PAGE_RPC?.trim() || "get_puzzle_progress_page";
const ATTEMPTED_PUZZLE_IDS_RPC =
  import.meta.env.VITE_SUPABASE_ATTEMPTED_PUZZLE_IDS_RPC?.trim() || "get_attempted_puzzle_ids";
const puzzleProgressWriteRequests = new Map();

const normalizePuzzleId = (puzzleId) => {
  if (puzzleId === undefined || puzzleId === null) return "";
  return String(puzzleId).trim();
};

const getLocalProgressStorageKey = (username) =>
  `atomic-puzzles.puzzle-progress.${normalizeUsername(username)}`;

const readLocalPuzzleProgress = (username) => {
  if (typeof window === "undefined") return [];

  const storageKey = getLocalProgressStorageKey(username);
  if (!storageKey) return [];

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return [];

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map((row) => ({
        puzzle_id: normalizePuzzleId(row?.puzzle_id),
        first_attempt_at: typeof row?.first_attempt_at === "string" ? row.first_attempt_at : "",
        puzzle_correct: Boolean(row?.puzzle_correct),
      }))
      .filter((row) => row.puzzle_id && row.first_attempt_at);
  } catch {
    return [];
  }
};

const writeLocalPuzzleProgress = (username, rows) => {
  if (typeof window === "undefined") return;

  const storageKey = getLocalProgressStorageKey(username);
  if (!storageKey) return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(rows));
  } catch {
    // Keep puzzle progress resilient if local storage is unavailable.
  }
};

const mergePuzzleProgressRows = (serverRows, localRows) => {
  const rowsByPuzzleId = new Map();

  [...serverRows, ...localRows].forEach((row) => {
    const puzzleId = normalizePuzzleId(row?.puzzle_id);
    const firstAttemptAt = typeof row?.first_attempt_at === "string" ? row.first_attempt_at : "";
    if (!puzzleId || !firstAttemptAt) return;

    const normalizedRow = {
      puzzle_id: puzzleId,
      first_attempt_at: firstAttemptAt,
      puzzle_correct: Boolean(row?.puzzle_correct),
    };
    const existingRow = rowsByPuzzleId.get(puzzleId);

    if (!existingRow) {
      rowsByPuzzleId.set(puzzleId, normalizedRow);
      return;
    }

    const existingTime = new Date(existingRow.first_attempt_at).getTime();
    const nextTime = new Date(normalizedRow.first_attempt_at).getTime();
    const useNextRow =
      Number.isNaN(existingTime) || (!Number.isNaN(nextTime) && nextTime < existingTime);

    if (useNextRow) {
      rowsByPuzzleId.set(puzzleId, normalizedRow);
    }
  });

  return Array.from(rowsByPuzzleId.values()).sort((left, right) => {
    const leftTime = new Date(left.first_attempt_at).getTime();
    const rightTime = new Date(right.first_attempt_at).getTime();
    return rightTime - leftTime;
  });
};

const upsertLocalPuzzleProgressRow = (username, row) => {
  const puzzleId = normalizePuzzleId(row?.puzzle_id);
  const firstAttemptAt = typeof row?.first_attempt_at === "string" ? row.first_attempt_at : "";
  if (!puzzleId || !firstAttemptAt) return;

  const mergedRows = mergePuzzleProgressRows(readLocalPuzzleProgress(username), [
    {
      puzzle_id: puzzleId,
      first_attempt_at: firstAttemptAt,
      puzzle_correct: Boolean(row?.puzzle_correct),
    },
  ]);

  writeLocalPuzzleProgress(username, mergedRows);
};

const loadPuzzleProgressPageFromRpc = async (supabase, username, page, pageSize) => {
  const { data, error } = await supabase.rpc(PUZZLE_PROGRESS_PAGE_RPC, {
    p_username: username,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const normalizedRows = rows
    .map((row) => ({
      puzzle_id: normalizePuzzleId(row?.puzzle_id),
      first_attempt_at: typeof row?.first_attempt_at === "string" ? row.first_attempt_at : "",
      puzzle_correct: Boolean(row?.puzzle_correct),
      total_count: Number.isFinite(Number(row?.total_count)) ? Number(row.total_count) : null,
    }))
    .filter((row) => row.puzzle_id && row.first_attempt_at);

  const total =
    normalizedRows.length > 0 && Number.isFinite(Number(normalizedRows[0]?.total_count))
      ? Number(normalizedRows[0].total_count)
      : normalizedRows.length;

  return { rows: normalizedRows, total };
};

const loadAllPuzzleProgressRowsFromRpc = async (supabase, username, pageSize = 1000) => {
  const normalizedPageSize = Math.max(1, Math.floor(Number(pageSize)) || 1000);
  const allRows = [];
  let currentPage = 1;
  let total = 0;

  for (;;) {
    const { rows, total: pageTotal } = await loadPuzzleProgressPageFromRpc(
      supabase,
      username,
      currentPage,
      normalizedPageSize,
    );

    allRows.push(...rows);
    total = pageTotal;

    if (allRows.length >= total || rows.length < normalizedPageSize) {
      return allRows;
    }

    currentPage += 1;
  }
};

const loadAttemptedPuzzleIdsFromRpc = async (supabase, username) => {
  const { data, error } = await supabase.rpc(ATTEMPTED_PUZZLE_IDS_RPC, {
    p_username: username,
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => normalizePuzzleId(row?.puzzle_id ?? row)).filter(Boolean);
};

export const recordPuzzleProgress = async ({ username, puzzleId, puzzleCorrect }) => {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPuzzleId = normalizePuzzleId(puzzleId);

  if (!normalizedUsername || !normalizedPuzzleId) return;

  const requestKey = `${normalizedUsername}:${normalizedPuzzleId}`;
  const existingRequest = puzzleProgressWriteRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const firstAttemptAt = new Date().toISOString();
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc(PUZZLE_PROGRESS_RPC, {
      p_username: normalizedUsername,
      p_puzzle_id: normalizedPuzzleId,
      p_puzzle_correct: Boolean(puzzleCorrect),
    });

    if (error) {
      throw new Error(`Unable to record puzzle progress: ${error.message}`);
    }

    upsertLocalPuzzleProgressRow(normalizedUsername, {
      puzzle_id: normalizedPuzzleId,
      first_attempt_at: firstAttemptAt,
      puzzle_correct: Boolean(puzzleCorrect),
    });
  })().finally(() => {
    if (puzzleProgressWriteRequests.get(requestKey) === request) {
      puzzleProgressWriteRequests.delete(requestKey);
    }
  });

  puzzleProgressWriteRequests.set(requestKey, request);
  return request;
};

export const fetchPuzzleProgressPage = async (
  username,
  { page = 1, pageSize = 20 } = {},
) => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return { rows: [], total: 0 };
  }

  const boundedPage = Math.max(1, Math.floor(Number(page)) || 1);
  const boundedPageSize = Math.max(1, Math.floor(Number(pageSize)) || 20);
  const from = (boundedPage - 1) * boundedPageSize;
  const localRows = readLocalPuzzleProgress(normalizedUsername);
  let serverRows = [];
  let serverCount = 0;

  try {
    const supabase = getSupabaseClient();
    try {
      const { rows, total } = await loadPuzzleProgressPageFromRpc(
        supabase,
        normalizedUsername,
        boundedPage,
        boundedPageSize,
      );
      serverRows = rows;
      serverCount = total;
    } catch {
      const { rows, count } = await loadSupabasePage(
        PUZZLE_PROGRESS_TABLE,
        supabase
          .from(PUZZLE_PROGRESS_TABLE)
          .select("puzzle_id,first_attempt_at,puzzle_correct", { count: "exact" })
          .eq("username", normalizedUsername)
          .order("first_attempt_at", { ascending: false })
          .range(0, Math.max(from + boundedPageSize - 1, boundedPageSize - 1)),
      );

      serverRows = Array.isArray(rows) ? rows : [];
      serverCount = count ?? serverRows.length;
    }
  } catch {
    serverRows = [];
    serverCount = 0;
  }

  const mergedRows = mergePuzzleProgressRows(serverRows, localRows);
  const pagedRows = mergedRows.slice(from, from + boundedPageSize);

  return {
    rows: pagedRows,
    total: Math.max(serverCount, mergedRows.length),
  };
};

export const fetchPuzzleProgressSummary = async (username) => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    return {
      total: 0,
      correct: 0,
      incorrect: 0,
    };
  }

  const localRows = readLocalPuzzleProgress(normalizedUsername);
  let serverRows = [];

  try {
    const supabase = getSupabaseClient();
    try {
      serverRows = await loadAllPuzzleProgressRowsFromRpc(supabase, normalizedUsername);
    } catch {
      serverRows = await fetchAllSupabaseRows(PUZZLE_PROGRESS_TABLE, () =>
        supabase
          .from(PUZZLE_PROGRESS_TABLE)
          .select("puzzle_id,first_attempt_at,puzzle_correct")
          .eq("username", normalizedUsername)
          .order("first_attempt_at", { ascending: false }),
      );
    }
  } catch {
    serverRows = [];
  }

  const mergedRows = mergePuzzleProgressRows(serverRows, localRows);
  const correct = mergedRows.filter((row) => Boolean(row?.puzzle_correct)).length;
  const total = mergedRows.length;

  return {
    total,
    correct,
    incorrect: total - correct,
  };
};

export const fetchAttemptedPuzzleIds = async (username) => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return new Set();
  const localRows = readLocalPuzzleProgress(normalizedUsername);
  let serverRows = [];

  try {
    const supabase = getSupabaseClient();
    try {
      serverRows = await loadAttemptedPuzzleIdsFromRpc(supabase, normalizedUsername);
    } catch {
      serverRows = await fetchAllSupabaseRows(PUZZLE_PROGRESS_TABLE, () =>
        supabase
          .from(PUZZLE_PROGRESS_TABLE)
          .select("puzzle_id")
          .eq("username", normalizedUsername),
      );
    }
  } catch {
    serverRows = [];
  }

  return new Set(
    [...serverRows, ...localRows].map((row) => normalizePuzzleId(row?.puzzle_id)).filter(Boolean),
  );
};
