import { type ExplorerColor, PLAYER_MIN_RATING } from "./requestSchema.js";
import {
  buildOpeningExplorerSql,
  lastMoveColorFromFen,
  OPENING_EXPLORER_RESPONSE_SCHEMA,
  positionKeyHex,
} from "./sql.js";

export type ExplorerQueryPlan = {
  cacheKey: string;
  color: ExplorerColor;
  endDate: number | null;
  fen: string;
  includePositionExtras: boolean;
  keyHex: string;
  lastMoveColor: number | null;
  opponent: string;
  playerMinRating: number | null;
  queryMinRating: number;
  speeds: number[];
  startDate: number | null;
  username: string;
};

export const createExplorerQueryPlan = (input: {
  databaseSignature: string;
  fen: string;
  requestedColor: ExplorerColor;
  requestedUsername: string;
  requestedOpponent: string;
  username: string;
  opponent: string;
  playerMinRating: number | null;
  speeds: number[];
  startDate: number | null;
  endDate: number | null;
}): ExplorerQueryPlan => {
  const color = input.username && input.requestedColor === "all" ? 0 : input.requestedColor;
  const keyHex = positionKeyHex(input.fen);
  const plan = {
    color,
    endDate: input.endDate,
    fen: input.fen,
    includePositionExtras: !input.username,
    keyHex,
    lastMoveColor: lastMoveColorFromFen(input.fen),
    opponent: input.opponent,
    playerMinRating: input.playerMinRating,
    queryMinRating: input.playerMinRating ?? PLAYER_MIN_RATING,
    speeds: input.speeds,
    startDate: input.startDate,
    username: input.username,
  };

  return {
    ...plan,
    cacheKey: JSON.stringify({
      responseSchema: OPENING_EXPLORER_RESPONSE_SCHEMA,
      databaseSignature: input.databaseSignature,
      fen: input.fen,
      color,
      requestedUsername: input.requestedUsername,
      username: input.username,
      requestedOpponent: input.requestedOpponent,
      opponent: input.opponent,
      playerMinRating: input.playerMinRating,
      speeds: input.speeds,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
  };
};

export const buildExplorerQueries = (plan: ExplorerQueryPlan) =>
  buildOpeningExplorerSql({
    color: plan.color,
    endDate: plan.endDate,
    keyHex: plan.keyHex,
    opponent: plan.opponent,
    playerMinRating: plan.queryMinRating,
    speeds: plan.speeds,
    startDate: plan.startDate,
    username: plan.username,
  });
