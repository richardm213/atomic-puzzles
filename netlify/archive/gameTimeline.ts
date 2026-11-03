type BlobValue = ArrayBuffer | Uint8Array | number[] | string | Record<string, unknown> | null;

const bytesFromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(Buffer.from(value, "base64"));

export const toBlobBytes = (value: BlobValue): Uint8Array | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === "string") return bytesFromBase64(value);
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([key, byte]) => /^\d+$/.test(key) && Number.isInteger(Number(byte)))
      .sort(([left], [right]) => Number(left) - Number(right));
    return entries.length ? Uint8Array.from(entries.map(([, byte]) => Number(byte))) : null;
  }
  return null;
};

const squareName = (code: number): string =>
  `${String.fromCharCode("a".charCodeAt(0) + (code % 8))}${Math.floor(code / 8) + 1}`;

export const decodePackedMoves = (value: BlobValue): string[] | null => {
  const bytes = toBlobBytes(value);
  if (bytes === null) return null;
  if (bytes.length % 2 !== 0) throw new Error("Invalid packed move payload");

  const promotions = ["", "q", "r", "b", "n"];
  const moves: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const packed = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
    const promotion = promotions[(packed >> 12) & 7];
    if (promotion === undefined) throw new Error("Invalid promotion code");
    moves.push(`${squareName(packed & 63)}${squareName((packed >> 6) & 63)}${promotion}`);
  }
  return moves;
};

export const decodeVarints = (value: BlobValue): number[] | null => {
  const bytes = toBlobBytes(value);
  if (bytes === null) return null;
  const values: number[] = [];
  let current = 0;
  let shift = 0;
  for (const byte of bytes) {
    current += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) !== 0) {
      shift += 7;
      if (shift > 63) throw new Error("Varint is too large");
    } else {
      values.push(current);
      current = 0;
      shift = 0;
    }
  }
  if (shift !== 0) throw new Error("Truncated varint payload");
  return values;
};

const unzigzag = (value: number): number =>
  value % 2 === 0 ? value / 2 : -Math.floor(value / 2) - 1;

export const decodePackedClocks = (value: BlobValue): number[] | null => {
  const encoded = decodeVarints(value);
  if (encoded === null) return null;
  const previous: Array<number | null> = [null, null];
  return encoded.map((entry, ply) => {
    const side = ply % 2;
    const prior = previous[side] ?? null;
    const clock = prior === null ? entry : prior + unzigzag(entry);
    previous[side] = clock;
    return clock;
  });
};

export const decodePackedMoveTimestamps = (value: BlobValue): number[] | null => {
  const encoded = decodeVarints(value);
  if (encoded === null) return null;
  const timestamps: number[] = [];
  for (const entry of encoded) {
    timestamps.push(timestamps.length ? (timestamps.at(-1) ?? 0) + entry : entry);
  }
  return timestamps;
};

export const ratingsWithMatchOrientation = (row: Record<string, unknown>) => {
  const bytes = toBlobBytes(row.ratings as BlobValue);
  if (bytes === null) return null;
  if (bytes.length !== 8) throw new Error("Invalid packed rating payload");

  const values = Array.from({ length: 4 }, (_, index) => {
    const offset = index * 2;
    return ((bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)) / 10;
  });
  const [whiteBefore, whiteAfter, blackBefore, blackAfter] = values;
  const player1IsWhite = (Number(row.result) & 1) === 0;

  return player1IsWhite
    ? {
        p1_before_rating: whiteBefore,
        p1_after_rating: whiteAfter,
        p2_before_rating: blackBefore,
        p2_after_rating: blackAfter,
      }
    : {
        p1_before_rating: blackBefore,
        p1_after_rating: blackAfter,
        p2_before_rating: whiteBefore,
        p2_after_rating: whiteAfter,
      };
};

export const timelineWithValidatedLengths = (row: Record<string, unknown>) => {
  const moves = decodePackedMoves(row.moves as BlobValue);
  if (moves === null) return { moves: null, clocks: null, move_ts: null };
  const clocks = decodePackedClocks(row.clocks as BlobValue);
  const moveTimestamps = decodePackedMoveTimestamps(row.move_ts as BlobValue);
  return {
    moves,
    clocks: clocks && clocks.length > 0 && clocks.length <= moves.length ? clocks : null,
    move_ts: moveTimestamps?.length === moves.length ? moveTimestamps : null,
  };
};
