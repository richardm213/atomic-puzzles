import { fetchMatchRowsFromSupabase } from "./supabaseMatchRows";
import {
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  parseWinnerFromPerspective,
  winnerToFullWord,
} from "../utils/matchTransforms";
import { matchSourceFromValues } from "../utils/matchFilters";
import { normalizeUsername } from "../utils/playerNames";

const toNullableNumber = (value) => {
  const parsed = Number(value);
  return parsed;
};

const parseGamesCompact = (gamesValue) => {
  if (Array.isArray(gamesValue)) return gamesValue;
  const raw = String(gamesValue ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseMatchRows = (rows) => {
  if (!rows.length) return [];
  return rows
    .map((row, index) => {
      const fallbackMatchId = String(row.match_id || "").trim() || `match_${index + 1}`;
      const p1 = String(row.player_1 || "Unknown");
      const p2 = String(row.player_2 || "Unknown");
      const games = parseGamesCompact(row.games)
        .map((entry, gameOffset) => {
          const [gameId, winnerCodeRaw, winnerPlayerRaw, whitePlayerRaw] = String(
            entry || "",
          ).split(",");
          const winnerCode = String(winnerCodeRaw || "")
            .trim()
            .toLowerCase();
          const winnerPlayer = String(winnerPlayerRaw || "").trim();
          const whiteSlot = String(whitePlayerRaw || "").trim();
          const white = whiteSlot === "2" ? p2 : p1;
          const black = whiteSlot === "2" ? p1 : p2;

          let winner = winnerToFullWord(winnerCode);
          if (!["white", "black", "draw"].includes(winner)) {
            if (winnerPlayer === "0" || winnerCode === "d") winner = "draw";
            else if (winnerPlayer === "1") winner = white === p1 ? "white" : "black";
            else if (winnerPlayer === "2") winner = white === p2 ? "white" : "black";
            else winner = "draw";
          }

          return {
            id: String(gameId || `game_${index + 1}_${gameOffset + 1}`),
            game_index: gameOffset + 1,
            end_ts: toNullableNumber(row.end_ts),
            winner,
            white,
            black,
          };
        })
        .filter((game) => game.id);

      return {
        match_id: fallbackMatchId,
        players: [p1, p2],
        start_ts: toNullableNumber(row.start_ts),
        end_ts: toNullableNumber(row.end_ts),
        time_control: row.time_control,
        source: row.source,
        tournament_id: row.tournament_id,
        games,
        ratings: {
          [p1]: {
            before_rating: toNullableNumber(row.p1_before_rating),
            after_rating: toNullableNumber(row.p1_after_rating),
            before_rd: toNullableNumber(row.p1_before_rd),
            after_rd: toNullableNumber(row.p1_after_rd),
          },
          [p2]: {
            before_rating: toNullableNumber(row.p2_before_rating),
            after_rating: toNullableNumber(row.p2_after_rating),
            before_rd: toNullableNumber(row.p2_before_rd),
            after_rd: toNullableNumber(row.p2_after_rd),
          },
        },
      };
    })
    .map((match) => {
      const orderedGames = [...match.games].sort((a, b) => {
        const aIndex = a.game_index;
        const bIndex = b.game_index;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return (a.end_ts ?? 0) - (b.end_ts ?? 0);
      });

      return {
        ...match,
        start_ts: match.start_ts,
        end_ts: match.end_ts,
        games: orderedGames,
      };
    });
};

export const loadRawMatchesByMode = async (mode, options = {}) => {
  const { filters = {}, page, pageSize } = options;
  if (mode === "all") {
    const [blitzMatches, bulletMatches] = await Promise.all([
      loadRawMatchesByMode("blitz", { filters, page, pageSize }),
      loadRawMatchesByMode("bullet", { filters, page, pageSize }),
    ]);
    if (pageSize) {
      return {
        matches: [...(blitzMatches.matches ?? []), ...(bulletMatches.matches ?? [])],
        total: (blitzMatches.total ?? 0) + (bulletMatches.total ?? 0),
      };
    }
    return [...blitzMatches, ...bulletMatches];
  }

  const result = await fetchMatchRowsFromSupabase(mode, filters, { page, pageSize });
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const matches = parseMatchRows(rows);
  if (pageSize) {
    return {
      matches,
      total: Number(result?.total) || matches.length,
    };
  }
  return matches;
};

export const normalizeMatches = (matches, username) => {
  const normalizedUsername = normalizeUsername(username);
  return (Array.isArray(matches) ? matches : [])
    .filter((match) => {
      const players = normalizedPlayersFromMatch(match);
      return players.some((player) => normalizeUsername(player) === normalizedUsername);
    })
    .map((match) => {
      const players = normalizedPlayersFromMatch(match);
      const opponent =
        players.find((player) => normalizeUsername(player) !== normalizedUsername) || "Unknown";
      const games = normalizedGamesFromMatch(match, players);
      const score = games.reduce(
        (accumulator, game) => {
          const result = parseWinnerFromPerspective(game, normalizedUsername);
          if (result === "win") {
            accumulator.player += 1;
          } else if (result === "draw") {
            accumulator.player += 0.5;
            accumulator.opponent += 0.5;
          } else {
            accumulator.opponent += 1;
          }
          return accumulator;
        },
        { player: 0, opponent: 0 },
      );
      let runningPlayerScore = 0;
      let runningOpponentScore = 0;
      const matchGames = games.map((game) => {
        const result = parseWinnerFromPerspective(game, normalizedUsername);
        if (result === "win") {
          runningPlayerScore += 1;
        } else if (result === "draw") {
          runningPlayerScore += 0.5;
          runningOpponentScore += 0.5;
        } else {
          runningOpponentScore += 1;
        }

        const winnerLabel =
          result === "win" ? normalizedUsername : result === "loss" ? opponent : "draw";

        return {
          id: String(game?.id || "—"),
          winner: winnerLabel,
          playerScoreAfter: runningPlayerScore,
          opponentScoreAfter: runningOpponentScore,
        };
      });

      const ratings = normalizedRatingsFromMatch(match, players);
      const ratingData = ratings?.[normalizedUsername] || null;
      const opponentLower = String(opponent).toLowerCase();
      const opponentRatingData = ratings?.[opponent] || ratings?.[opponentLower] || null;
      const beforeRating = Number(ratingData?.before_rating);
      const afterRating = Number(ratingData?.after_rating);
      const beforeRd = Number(ratingData?.before_rd);
      const afterRd = Number(ratingData?.after_rd);
      const opponentBeforeRating = Number(opponentRatingData?.before_rating);
      const opponentAfterRating = Number(opponentRatingData?.after_rating);
      const opponentBeforeRd = Number(opponentRatingData?.before_rd);
      const opponentAfterRd = Number(opponentRatingData?.after_rd);
      const firstGame = games[0];
      const rawSourceValue = [
        firstGame?.source,
        firstGame?.match_source,
        firstGame?.queue,
        match?.source,
        match?.match_source,
        match?.queue,
      ].find((value) => value !== undefined && value !== null && String(value).trim().length > 0);

      return {
        startTs: Number(match?.start_ts ?? match?.s),
        timeControl: String(match?.time_control ?? match?.t ?? "—"),
        opponent: String(opponent),
        score: `${score.player}-${score.opponent}`,
        playerScore: score.player,
        opponentScore: score.opponent,
        ratingChange: afterRating - beforeRating,
        rdChange: afterRd - beforeRd,
        beforeRating,
        beforeRd,
        afterRating,
        afterRd,
        opponentBeforeRating,
        opponentAfterRating,
        opponentBeforeRd,
        opponentAfterRd,
        gameCount: games.length,
        firstGameId: String(games[0]?.id || "—"),
        games: matchGames,
        sourceValue:
          rawSourceValue === undefined ||
          rawSourceValue === null ||
          String(rawSourceValue).trim().length === 0
            ? "—"
            : String(rawSourceValue),
        sourceKey: matchSourceFromValues(
          firstGame?.source,
          firstGame?.match_source,
          firstGame?.queue,
          match?.source,
          match?.match_source,
          match?.queue,
        ),
      };
    })
    .sort((a, b) => b.startTs - a.startTs);
};
