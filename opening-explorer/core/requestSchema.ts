import { sqlMonthBounds } from "../../opening-explorer-sql.js";

export const PLAYER_MIN_RATING = 1700;
export const MAX_EXPLORER_RATING = 2200;

const MAX_FEN_LENGTH = 120;
const MAX_USERNAME_LENGTH = 40;
const ALLOWED_QUERY_PARAMS = new Set([
  "fen",
  "color",
  "minRating",
  "speeds",
  "startDate",
  "endDate",
  "username",
  "opponent",
  "players",
  "randomPlayer",
]);

export type ExplorerColor = 0 | 1 | "all";

export type ParsedExplorerRequest =
  | { kind: "health" }
  | { kind: "players" }
  | { kind: "randomPlayer" }
  | {
      kind: "explorer";
      fen: string;
      requestedColor: ExplorerColor;
      requestedUsername: string;
      requestedOpponent: string;
      playerMinRating: number | null;
      speeds: number[];
      startDate: number | null;
      endDate: number | null;
    };

export type ParseResult =
  { ok: true; request: ParsedExplorerRequest } | { ok: false; error: string };

const invalid = (error: string): ParseResult => ({ ok: false, error });

const isValidFen = (fen: string): boolean => {
  if (fen.length > MAX_FEN_LENGTH || !/^[0-9a-hwbkqnrpBKQNRP/\-. ]+$/.test(fen)) return false;

  const fields = fen.split(/\s+/);
  if (fields.length !== 6) return false;
  const [board, activeColor, castling, enPassant, halfmoveClock, fullmoveNumber] = fields;
  if (!board || !activeColor || !castling || !enPassant || !halfmoveClock || !fullmoveNumber) {
    return false;
  }
  if (activeColor !== "w" && activeColor !== "b") return false;
  if (!/^(?:-|[KQkq]{1,4})$/.test(castling)) return false;
  if (!/^(?:-|[a-h][36])$/.test(enPassant)) return false;
  if (!/^\d{1,3}$/.test(halfmoveClock) || !/^\d{1,4}$/.test(fullmoveNumber)) return false;

  const ranks = board.split("/");
  return (
    ranks.length === 8 &&
    ranks.every((rank) => {
      let files = 0;
      for (const char of rank) {
        if (/^[1-8]$/.test(char)) files += Number(char);
        else if (/^[bkqnrpBKQNRP]$/.test(char)) files += 1;
        else return false;
      }
      return files === 8;
    })
  );
};

const parseUsername = (value: string | null): string | null => {
  const username = value?.trim().toLowerCase() ?? "";
  if (!username) return "";
  return username.length <= MAX_USERNAME_LENGTH && /^[a-z0-9_-]+$/.test(username) ? username : null;
};

const parseColor = (value: string | null): ExplorerColor | null => {
  if (!value) return "all";
  if (value === "white") return 0;
  if (value === "black") return 1;
  return null;
};

const parseMinRating = (value: string | null): number => {
  if (!value || !/^\d{3,4}$/.test(value)) return PLAYER_MIN_RATING;
  const rating = Number.parseInt(value, 10);
  return Number.isFinite(rating)
    ? Math.max(PLAYER_MIN_RATING, Math.min(MAX_EXPLORER_RATING, rating))
    : PLAYER_MIN_RATING;
};

const parseSpeeds = (value: string | null): number[] | null => {
  if (!value) return [0, 1, 2];
  if (!/^[012](?:,[012])*$/.test(value)) return null;
  return [...new Set(value.split(",").map(Number))].sort();
};

export const parseExplorerRequest = (path: string, params: URLSearchParams): ParseResult => {
  if (path.endsWith("/health")) return { ok: true, request: { kind: "health" } };

  for (const key of params.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key)) return invalid(`Unexpected query parameter: ${key}`);
  }

  if (path.endsWith("/opening-players") || params.get("players") === "1") {
    return { ok: true, request: { kind: "players" } };
  }
  if (params.get("randomPlayer") === "1") {
    return { ok: true, request: { kind: "randomPlayer" } };
  }

  const fen = params.get("fen")?.trim() ?? "";
  if (!fen) return invalid("Missing fen query parameter");
  if (!isValidFen(fen)) return invalid("Invalid fen query parameter");

  const requestedUsername = parseUsername(params.get("username"));
  if (requestedUsername === null) return invalid("Invalid username query parameter");
  const requestedOpponent = parseUsername(params.get("opponent"));
  if (requestedOpponent === null) return invalid("Invalid opponent query parameter");
  const requestedColor = parseColor(params.get("color"));
  if (requestedColor === null) return invalid("Invalid color query parameter");
  const speeds = parseSpeeds(params.get("speeds"));
  if (speeds === null) return invalid("Invalid speeds query parameter");

  const startDate = sqlMonthBounds(params.get("startDate")?.trim() ?? "")?.start ?? null;
  const endDate = sqlMonthBounds(params.get("endDate")?.trim() ?? "")?.end ?? null;
  if (
    (params.has("startDate") && startDate === null) ||
    (params.has("endDate") && endDate === null)
  ) {
    return invalid("Invalid month filter query parameter");
  }

  return {
    ok: true,
    request: {
      kind: "explorer",
      fen,
      requestedColor,
      requestedUsername,
      requestedOpponent,
      playerMinRating: requestedUsername ? parseMinRating(params.get("minRating")) : null,
      speeds,
      startDate,
      endDate,
    },
  };
};
