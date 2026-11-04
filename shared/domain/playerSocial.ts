export const DEFAULT_FOLLOWED_PLAYERS = ["admin", "seaside_tiramisu"] as const;
export const PLAYER_RATING_SNAPSHOT_DATE = "2026-10-31";

export type StoredPlayerRating = {
  tc: string;
  rating: number | null;
  rd: number | null;
};

// Native Unicode emoji use the current platform artwork (Apple artwork on Apple devices).
// Chess-piece emoji are intentionally omitted so flair stays distinct from rating modes.
export const PLAYER_FLAIRS = [
  "😀",
  "😎",
  "🥳",
  "🤓",
  "🫡",
  "🫠",
  "👻",
  "👽",
  "🤖",
  "🐺",
  "🦊",
  "🐯",
  "🦁",
  "🐸",
  "🐙",
  "🦋",
  "🐝",
  "🦖",
  "🐉",
  "🦄",
  "🪿",
  "🪼",
  "🫎",
  "🌞",
  "🌙",
  "⭐",
  "🔥",
  "⚡",
  "❄️",
  "🌊",
  "🍀",
  "🌵",
  "🍎",
  "🍉",
  "🍄",
  "🚀",
  "🎯",
  "🎨",
  "🎸",
  "🏆",
] as const;

export type PlayerFlair = (typeof PLAYER_FLAIRS)[number];
