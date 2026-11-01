import type { JsonRow } from "./service.js";

const PAYLOAD_VERSION = 1;
const RECENT_LIMIT = 8;
const PROMOTIONS = ["", "n", "b", "r", "q", "k"] as const;

type Aggregate = {
  whiteWins: number;
  draws: number;
  blackWins: number;
  ratedGames: number;
  ratingSum: number;
};

export type PackedRecentReference = { gameKey: number; playedAt: number; uci: string };
export type PackedMove = {
  uci: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  avgOpponentRating: number | null;
};

const asBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) {
    return Uint8Array.from(value as number[]);
  }
  throw new Error("Opening explorer returned an invalid packed payload");
};

const readVarint = (bytes: Uint8Array, start: number): [number, number] => {
  let value = 0;
  let multiplier = 1;
  let offset = start;
  while (offset < bytes.length) {
    const byte = bytes[offset++]!;
    value += (byte & 0x7f) * multiplier;
    if (value > Number.MAX_SAFE_INTEGER) throw new Error("Opening payload integer is too large");
    if (byte < 0x80) return [value, offset];
    multiplier *= 128;
    if (multiplier > 2 ** 56) break;
  }
  throw new Error("Opening explorer returned a truncated packed payload");
};

const squareName = (square: number): string =>
  `${String.fromCharCode("a".charCodeAt(0) + (square % 8))}${Math.floor(square / 8) + 1}`;

export const decodePackedMove = (value: number): string => {
  const promotion = PROMOTIONS[value >> 12];
  if (promotion === undefined) throw new Error("Opening payload contains an invalid promotion");
  return `${squareName(value & 63)}${squareName((value >> 6) & 63)}${promotion}`;
};

export const mergePackedPayloads = (
  payloadValues: unknown[],
  ratingDivisor: 1 | 2,
  minimumRating: number | null = null,
): { moves: PackedMove[]; recent: PackedRecentReference[] } => {
  const moves = new Map<number, Aggregate>();
  const recent = new Map<string, PackedRecentReference>();
  const minimumRatingBand = minimumRating === null ? null : Math.floor(minimumRating / 50);

  for (const payloadValue of payloadValues) {
    const bytes = asBytes(payloadValue);
    if (bytes[0] !== PAYLOAD_VERSION) throw new Error("Unsupported opening payload version");
    let offset = 1;
    const [groupCount, groupOffset] = readVarint(bytes, offset);
    offset = groupOffset;

    for (let group = 0; group < groupCount; group += 1) {
      if (offset + 3 > bytes.length)
        throw new Error("Opening explorer returned a truncated packed payload");
      const move = bytes[offset]! | (bytes[offset + 1]! << 8);
      const ratingBand = bytes[offset + 2]!;
      offset += 3; // uint16 move + uint8 rating band
      const values: number[] = [];
      for (let field = 0; field < 5; field += 1) {
        let value;
        [value, offset] = readVarint(bytes, offset);
        values.push(value);
      }
      const includeGroup =
        minimumRatingBand === null || (ratingBand > 0 && ratingBand >= minimumRatingBand);
      if (includeGroup) {
        const current = moves.get(move) ?? {
          whiteWins: 0,
          draws: 0,
          blackWins: 0,
          ratedGames: 0,
          ratingSum: 0,
        };
        current.whiteWins += values[0] ?? 0;
        current.draws += values[1] ?? 0;
        current.blackWins += values[2] ?? 0;
        current.ratedGames += values[3] ?? 0;
        current.ratingSum += values[4] ?? 0;
        moves.set(move, current);
      }

      let recentCount;
      [recentCount, offset] = readVarint(bytes, offset);
      for (let item = 0; item < recentCount; item += 1) {
        let playedAt;
        let gameKey;
        [playedAt, offset] = readVarint(bytes, offset);
        [gameKey, offset] = readVarint(bytes, offset);
        if (includeGroup) {
          recent.set(`${playedAt}:${gameKey}:${move}`, {
            playedAt,
            gameKey,
            uci: decodePackedMove(move),
          });
        }
      }
    }
    if (offset !== bytes.length) throw new Error("Opening payload contains trailing bytes");
  }

  return {
    moves: [...moves.entries()]
      .map(([move, value]) => ({
        uci: decodePackedMove(move),
        games: value.whiteWins + value.draws + value.blackWins,
        whiteWins: value.whiteWins,
        draws: value.draws,
        blackWins: value.blackWins,
        avgOpponentRating:
          value.ratedGames > 0
            ? Math.round(value.ratingSum / (value.ratedGames * ratingDivisor))
            : null,
      }))
      .sort((left, right) => right.games - left.games || left.uci.localeCompare(right.uci))
      .slice(0, 12),
    recent: [...recent.values()]
      .sort(
        (left, right) =>
          right.playedAt - left.playedAt ||
          right.gameKey - left.gameKey ||
          left.uci.localeCompare(right.uci),
      )
      .slice(0, RECENT_LIMIT),
  };
};

export const hydratePackedRecentGames = (
  recent: PackedRecentReference[],
  gameRows: JsonRow[],
): JsonRow[] => {
  const gamesByKey = new Map(gameRows.map((row) => [Number(row.gameKey), row]));
  return recent.flatMap((reference) => {
    const game = gamesByKey.get(reference.gameKey);
    if (!game) return [];
    return [
      {
        uci: reference.uci,
        gameId: String(game.gameId ?? ""),
        playedAt: reference.playedAt,
        playedOn: Number(game.playedOn),
        white: game.white === null || game.white === undefined ? null : String(game.white),
        black: game.black === null || game.black === undefined ? null : String(game.black),
        whiteRating:
          game.whiteRating === null || game.whiteRating === undefined
            ? null
            : Number(game.whiteRating),
        blackRating:
          game.blackRating === null || game.blackRating === undefined
            ? null
            : Number(game.blackRating),
        winner: Number(game.winner),
      },
    ];
  });
};
