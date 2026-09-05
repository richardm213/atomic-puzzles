import type { RatingFields, RawGameObject, RawMatchLike, RawRatingsByPlayer } from "./types";

export type WinnerWord = "white" | "black" | "draw" | string;
export type GameOutcome = "win" | "loss" | "draw";

export type NormalizedGame = {
  id: string | number;
  white: string;
  black: string;
  winner: WinnerWord;
};

export type RatingEntry = RatingFields;

export type RatingsByPlayer = RawRatingsByPlayer;

const winnerCodeLookup: Record<string, string> = {
  w: "white",
  b: "black",
  d: "draw",
};

export const winnerToFullWord = (winner: unknown): WinnerWord => {
  const winnerValue = String(winner ?? "").toLowerCase();
  return winnerCodeLookup[winnerValue] ?? winnerValue;
};

export const normalizedPlayersFromMatch = (match: RawMatchLike | null | undefined): string[] => {
  if (Array.isArray(match?.players)) return match.players;
  return [];
};

export const normalizedGamesFromMatch = (
  match: RawMatchLike | null | undefined,
): NormalizedGame[] => {
  const gamesRaw: RawGameObject[] = Array.isArray(match?.games) ? match.games : [];

  return gamesRaw.map((game): NormalizedGame => {
    return {
      id: game.id ?? "—",
      white: String(game.white ?? ""),
      black: String(game.black ?? ""),
      winner: winnerToFullWord(game.winner),
    };
  });
};

export const normalizedRatingsFromMatch = (
  match: RawMatchLike | null | undefined,
): RatingsByPlayer => {
  return match?.ratings && typeof match.ratings === "object" ? match.ratings : {};
};

export const parseWinnerFromPerspective = (
  game: { white?: unknown; black?: unknown; winner?: unknown } | null | undefined,
  username: string,
): GameOutcome => {
  const white = String(game?.white ?? "").toLowerCase();
  const black = String(game?.black ?? "").toLowerCase();
  const winner = winnerToFullWord(game?.winner);

  if (winner === "draw") return "draw";
  if (winner === "white") return white === username ? "win" : "loss";
  if (winner === "black") return black === username ? "win" : "loss";
  return "draw";
};

export const findRatingDataForPlayer = (
  ratings: RatingsByPlayer | null | undefined,
  playerName: string,
): RatingEntry | null => {
  if (!ratings || typeof ratings !== "object") return null;
  const direct = ratings[playerName];
  if (direct) return direct;

  const playerLower = String(playerName).toLowerCase();
  const matchKey = Object.keys(ratings).find((key) => String(key).toLowerCase() === playerLower);
  if (!matchKey) return null;
  return ratings[matchKey] ?? null;
};

export const parseTimeControlParts = (
  timeControl: string | null | undefined,
): { initial: string; increment: string } => {
  const match = /^(\d+)\+(\d+)$/.exec(String(timeControl ?? "").trim());
  if (!match) return { initial: "", increment: "" };

  return { initial: String(Number(match[1])), increment: String(Number(match[2])) };
};
