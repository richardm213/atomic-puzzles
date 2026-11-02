import { isValidAtomicDbFen } from "./atomicDb";

const ATOMIC_TABLEBASE_URL = "https://tablebase.lichess.ovh/atomic";
export const MAX_ATOMIC_TABLEBASE_PIECES = 6;
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][nbrq]?$/;

type TablebaseCategory =
  | "win"
  | "syzygy-win"
  | "maybe-win"
  | "cursed-win"
  | "draw"
  | "blessed-loss"
  | "maybe-loss"
  | "syzygy-loss"
  | "loss"
  | "unknown";

type TablebaseMove = {
  uci?: unknown;
  category?: unknown;
  dtm?: unknown;
};

type TablebaseProbe = {
  category?: unknown;
  moves?: unknown;
};

type TablebaseMainline = {
  mainline?: unknown;
};

const pieceCountFromFen = (fen: string): number =>
  [...(fen.trim().split(/\s+/)[0] ?? "")].filter((character) => /[a-z]/i.test(character)).length;

export const isAtomicTablebaseFen = (fen: string): boolean =>
  isValidAtomicDbFen(fen) && pieceCountFromFen(fen) <= MAX_ATOMIC_TABLEBASE_PIECES;

const category = (value: unknown): TablebaseCategory => {
  switch (value) {
    case "win":
    case "syzygy-win":
    case "maybe-win":
    case "cursed-win":
    case "draw":
    case "blessed-loss":
    case "maybe-loss":
    case "syzygy-loss":
    case "loss":
      return value;
    default:
      return "unknown";
  }
};

const winnerFromCategory = (
  value: TablebaseCategory,
  sideToMove: "white" | "black",
): "white" | "black" | "draw" | null => {
  if (value === "draw") return "draw";
  if (value === "unknown") return null;
  const sideToMoveWins = value.endsWith("win");
  if (sideToMoveWins) return sideToMove;
  return sideToMove === "white" ? "black" : "white";
};

const statusForWinner = (winner: "white" | "black" | "draw" | null) =>
  winner === "white"
    ? "WHITE_WIN"
    : winner === "black"
      ? "BLACK_WIN"
      : winner === "draw"
        ? "DRAW"
        : "UNKNOWN";

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const getJson = async (url: URL, signal: AbortSignal): Promise<Response> =>
  fetch(url, { headers: { Accept: "application/json" }, signal });

export const queryAtomicTablebase = async (fen: string, signal: AbortSignal) => {
  if (!isAtomicTablebaseFen(fen)) return null;

  const probeUrl = new URL(ATOMIC_TABLEBASE_URL);
  probeUrl.searchParams.set("fen", fen);
  const probeResponse = await getJson(probeUrl, signal);
  if (probeResponse.status === 404) return null;
  const probeBody: unknown = await probeResponse.json().catch(() => null);
  if (
    !probeResponse.ok ||
    !probeBody ||
    typeof probeBody !== "object" ||
    !Array.isArray((probeBody as TablebaseProbe).moves)
  ) {
    throw new Error("Lichess returned an invalid atomic tablebase response.");
  }

  const sideToMove = fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";
  const opponent = sideToMove === "white" ? "black" : "white";
  const probeMoves = (probeBody as { moves: unknown[] }).moves;
  const moves = probeMoves
    .map((value: unknown) => (value && typeof value === "object" ? (value as TablebaseMove) : null))
    .filter((move): move is TablebaseMove => Boolean(move && typeof move.uci === "string"))
    .filter((move) => UCI_PATTERN.test(String(move.uci)))
    .slice(0, 5)
    .map((move) => {
      const moveCategory = category(move.category);
      const dtm = finiteNumber(move.dtm);
      return {
        uci: String(move.uci),
        status: statusForWinner(winnerFromCategory(moveCategory, opponent)),
        closure: moveCategory,
        score: null,
        point: null,
        // Move DTM is reported from the resulting position's perspective. Negating it
        // converts the value to the perspective of the player choosing this move.
        mate: dtm === null ? null : -dtm,
        backed_plies: 0,
      };
    });

  const bestMove = moves[0]?.uci ?? null;
  let mainline: string[] = bestMove ? [bestMove] : [];
  if (bestMove) {
    const mainlineUrl = new URL(`${ATOMIC_TABLEBASE_URL}/mainline`);
    mainlineUrl.searchParams.set("fen", fen);
    const mainlineResponse = await getJson(mainlineUrl, signal);
    if (mainlineResponse.ok) {
      const mainlineBody: unknown = await mainlineResponse.json().catch(() => null);
      const values =
        mainlineBody && typeof mainlineBody === "object"
          ? (mainlineBody as TablebaseMainline).mainline
          : null;
      if (Array.isArray(values)) {
        const parsed = values
          .map((value) =>
            value && typeof value === "object" ? (value as { uci?: unknown }).uci : null,
          )
          .filter((move): move is string => typeof move === "string" && UCI_PATTERN.test(move))
          .slice(0, 5);
        if (parsed[0] === bestMove) mainline = parsed;
      }
    }
  }

  return {
    position: {
      key: null,
      status: statusForWinner(
        winnerFromCategory(category((probeBody as TablebaseProbe).category), sideToMove),
      ),
      closure: "lichess-atomic-tablebase",
      score: null,
      point: null,
      best_move: bestMove,
      moves,
    },
    lines: Object.fromEntries(
      moves.map((move) => [move.uci, move.uci === bestMove ? mainline : [move.uci]]),
    ),
  };
};
