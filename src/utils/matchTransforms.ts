export type WinnerWord = "white" | "black" | "draw" | string;
export type GameOutcome = "win" | "loss" | "draw";

export type NormalizedGame = {
  id: string | number;
  white: string;
  black: string;
  winner: WinnerWord;
};

export type RatingEntry = {
  before_rating: number | null;
  after_rating: number | null;
  before_rd: number | null;
  after_rd: number | null;
};

export type RatingsByPlayer = Record<string, RatingEntry>;

const winnerCodeLookup: Record<string, string> = {
  w: "white",
  b: "black",
  d: "draw",
};

export const winnerToFullWord = (winner: unknown): WinnerWord => {
  const winnerValue = String(winner ?? "").toLowerCase();
  return winnerCodeLookup[winnerValue] ?? winnerValue;
};

type MatchLike = {
  players?: unknown;
  p?: unknown;
  games?: unknown;
  g?: unknown;
  ratings?: unknown;
  ra?: unknown;
  ratings_compact?: unknown;
  u?: unknown;
};

export const normalizedPlayersFromMatch = (match: MatchLike | null | undefined): string[] => {
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
  match: MatchLike | null | undefined,
  players: string[],
): NormalizedGame[] => {
  const gamesRaw: unknown[] = Array.isArray(match?.games)
    ? (match.games as unknown[])
    : Array.isArray(match?.g)
      ? (match.g as unknown[])
      : [];

  return gamesRaw.map((game): NormalizedGame => {
    if (Array.isArray(game)) {
      const [id, whiteRef, blackRef, winnerRef] = game as [
        string | number | undefined,
        unknown,
        unknown,
        unknown,
      ];
      return {
        id: id ?? "—",
        white: playerFromRef(whiteRef, players),
        black: playerFromRef(blackRef, players),
        winner: winnerToFullWord(winnerRef),
      };
    }

    const gameObj = game as
      | { id?: string | number; white?: unknown; black?: unknown; winner?: unknown }
      | null
      | undefined;
    return {
      id: gameObj?.id ?? "—",
      white: playerFromRef(gameObj?.white, players),
      black: playerFromRef(gameObj?.black, players),
      winner: winnerToFullWord(gameObj?.winner),
    };
  });
};

const ratingsFromCompact = (ratingsCompact: unknown, players: string[]): RatingsByPlayer => {
  if (!Array.isArray(ratingsCompact)) return {};

  const mappedEntries = ratingsCompact
    .map((entry): [string, RatingEntry] | null => {
      if (!Array.isArray(entry) || entry.length < 5) return null;
      const [playerRef, beforeRating, afterRating, beforeRd, afterRd] = entry as [
        unknown,
        number | null,
        number | null,
        number | null,
        number | null,
      ];
      const username = playerFromRef(playerRef, players);
      if (!username) return null;
      return [
        username,
        {
          before_rating: beforeRating,
          after_rating: afterRating,
          before_rd: beforeRd,
          after_rd: afterRd,
        },
      ];
    })
    .filter((entry): entry is [string, RatingEntry] => entry !== null);

  return Object.fromEntries(mappedEntries);
};

export const normalizedRatingsFromMatch = (
  match: MatchLike | null | undefined,
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
