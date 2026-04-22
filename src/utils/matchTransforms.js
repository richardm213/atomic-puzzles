const winnerCodeLookup = {
  w: "white",
  b: "black",
  d: "draw",
};

export const winnerToFullWord = (winner) => {
  const winnerValue = String(winner || "").toLowerCase();
  return winnerCodeLookup[winnerValue] || winnerValue;
};

export const normalizedPlayersFromMatch = (match) => {
  if (Array.isArray(match?.players)) return match.players;
  if (Array.isArray(match?.p)) return match.p;
  return [];
};

const playerFromRef = (playerRef, players) => {
  if (typeof playerRef === "number" && Number.isInteger(playerRef)) {
    return String(players[playerRef] || "");
  }

  const numericRef = Number(playerRef);
  if (Number.isInteger(numericRef) && String(playerRef).trim() !== "") {
    return String(players[numericRef] || "");
  }

  return String(playerRef || "");
};

export const normalizedGamesFromMatch = (match, players) => {
  const gamesRaw = Array.isArray(match?.games)
    ? match.games
    : Array.isArray(match?.g)
      ? match.g
      : [];

  return gamesRaw.map((game) => {
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
      id: game?.id ?? "—",
      white: playerFromRef(game?.white, players),
      black: playerFromRef(game?.black, players),
      winner: winnerToFullWord(game?.winner),
    };
  });
};

const ratingsFromCompact = (ratingsCompact, players) => {
  if (!Array.isArray(ratingsCompact)) return {};

  const mappedEntries = ratingsCompact
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 5) return null;
      const [playerRef, beforeRating, afterRating, beforeRd, afterRd] = entry;
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
    .filter(Boolean);

  return Object.fromEntries(mappedEntries);
};

export const normalizedRatingsFromMatch = (match, players) => {
  const ratings =
    match?.ratings && typeof match.ratings === "object"
      ? match.ratings
      : match?.ra && typeof match.ra === "object"
        ? match.ra
        : {};
  const ratingsCompact = match?.ratings_compact ?? match?.u;
  return {
    ...ratingsFromCompact(ratingsCompact, players),
    ...ratings,
  };
};

export const parseWinnerFromPerspective = (game, username) => {
  const white = String(game?.white || "").toLowerCase();
  const black = String(game?.black || "").toLowerCase();
  const winner = winnerToFullWord(game?.winner);

  if (winner === "draw") return "draw";
  if (winner === "white") return white === username ? "win" : "loss";
  if (winner === "black") return black === username ? "win" : "loss";
  return "draw";
};

export const findRatingDataForPlayer = (ratings, playerName) => {
  if (!ratings || typeof ratings !== "object") return null;
  if (ratings[playerName]) return ratings[playerName];

  const playerLower = String(playerName).toLowerCase();
  const matchKey = Object.keys(ratings).find((key) => String(key).toLowerCase() === playerLower);
  if (!matchKey) return null;
  return ratings[matchKey];
};

export const parseTimeControlParts = (timeControl) => {
  const [initialRaw, incrementRaw] = String(timeControl || "").split("+");
  const initialSeconds = Number(initialRaw);
  const incrementSeconds = Number(incrementRaw);
  return {
    initial: String(initialSeconds),
    increment: String(incrementSeconds),
  };
};
