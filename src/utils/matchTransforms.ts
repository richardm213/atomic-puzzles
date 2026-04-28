import type {
  GameSourceMetadata,
  RawCompactGameTuple,
  RawCompactRatingTuple,
  RawGameObject,
  RawMatchLike,
  RatingFields,
  RawRatingsByPlayer,
} from "../types/matchRaw";

export type WinnerWord = "white" | "black" | "draw" | string;
export type GameOutcome = "win" | "loss" | "draw";

export type NormalizedGame = GameSourceMetadata & {
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
  if (Array.isArray(match?.players)) return match.players as string[];
  if (Array.isArray(match?.p)) return match.p as string[];
  return [];
};

const playerFromRef = (playerRef: unknown, players: string[]): string => {
  if (typeof playerRef === "number" && Number.isInteger(playerRef)) {
    return String(players[playerRef] ?? "");
  }

  const numericRef = Number(playerRef);
  if (Number.isInteger(numericRef) && String(playerRef ?? "").trim() !== "") {
    return String(players[numericRef] ?? "");
  }

  return String(playerRef ?? "");
};

export const normalizedGamesFromMatch = (
  match: RawMatchLike | null | undefined,
  players: string[],
): NormalizedGame[] => {
  const gamesRaw: Array<RawCompactGameTuple | RawGameObject> = Array.isArray(match?.games)
    ? match.games
    : Array.isArray(match?.g)
      ? match.g
      : [];

  return gamesRaw.map((game): NormalizedGame => {
    if (Array.isArray(game)) {
      const [id, whiteRef, blackRef, winnerRef] = game;
      return {
        id: id ?? "—",
        white: playerFromRef(whiteRef, players),
        black: playerFromRef(blackRef, players),
        winner: winnerToFullWord(winnerRef),
      };
    }

    return {
      id: game.id ?? "—",
      white: playerFromRef(game.white, players),
      black: playerFromRef(game.black, players),
      winner: winnerToFullWord(game.winner),
      source: game.source,
      match_source: game.match_source,
      queue: game.queue,
    };
  });
};

const ratingsFromCompact = (
  ratingsCompact: RawCompactRatingTuple[] | null | undefined,
  players: string[],
): RatingsByPlayer => {
  if (!Array.isArray(ratingsCompact)) return {};

  const mappedEntries = ratingsCompact
    .map((entry): [string, RatingEntry] | null => {
      if (!Array.isArray(entry) || entry.length < 5) return null;
      const [playerRef, beforeRating, afterRating, beforeRd, afterRd] = entry;
      const username = playerFromRef(playerRef, players);
      if (!username) return null;
      return [
        username,
        {
          before_rating: beforeRating ?? null,
          after_rating: afterRating ?? null,
          before_rd: beforeRd ?? null,
          after_rd: afterRd ?? null,
        },
      ];
    })
    .filter((entry): entry is [string, RatingEntry] => entry !== null);

  return Object.fromEntries(mappedEntries);
};

export const normalizedRatingsFromMatch = (
  match: RawMatchLike | null | undefined,
  players: string[],
): RatingsByPlayer => {
  const ratings: RatingsByPlayer =
    match?.ratings && typeof match.ratings === "object"
      ? (match.ratings as RatingsByPlayer)
      : match?.ra && typeof match.ra === "object"
        ? (match.ra as RatingsByPlayer)
        : {};
  const ratingsCompact = match?.ratings_compact ?? match?.u;
  return {
    ...ratingsFromCompact(ratingsCompact, players),
    ...ratings,
  };
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
  const [initialRaw, incrementRaw] = String(timeControl ?? "").split("+");
  const initialSeconds = Number(initialRaw);
  const incrementSeconds = Number(incrementRaw);
  return {
    initial: String(initialSeconds),
    increment: String(incrementSeconds),
  };
};
