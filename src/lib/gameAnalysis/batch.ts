import { INITIAL_FEN } from "chessops/fen";

import type { ArchiveGame } from "../archive/games";
import { fetchArchiveGame } from "../archive/games";
import { inferAtomic960InitialFen } from "../games/initialFen";
import {
  fetchGameAnalysisStatuses,
  type GameAnalysisStatus,
  requestGameAnalysis,
} from "./gameAnalysis";

export type BatchAnalysisGame = { id: string; number: number };

export const analysisAlreadyCovered = (status: GameAnalysisStatus | undefined): boolean =>
  status !== undefined;

export const parseGameNumberSelection = (value: string, gameCount: number): number[] => {
  const input = value.trim();
  if (!input) return Array.from({ length: gameCount }, (_, index) => index + 1);

  const selected = new Set<number>();
  for (const rawPart of input.split(",")) {
    const part = rawPart.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`“${part || rawPart}” is not a valid game number or range.`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > gameCount) {
      throw new Error(`Use game numbers from 1 to ${gameCount}.`);
    }
    for (let number = start; number <= end; number += 1) selected.add(number);
  }
  return [...selected].sort((left, right) => left - right);
};

const initialFenForGame = (game: ArchiveGame): string | null => {
  const stored = game.initial_fen?.trim();
  if (stored) return stored;
  if (game.mode === "atomic960") return inferAtomic960InitialFen(game.moves);
  return INITIAL_FEN;
};

export type BatchAnalysisResult = {
  requestedGameIds: string[];
  balance: number | null;
  failures: Array<{ gameId: string; message: string }>;
};

export const requestGameAnalysisBatch = async (
  gameIds: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<BatchAnalysisResult> => {
  const requestedGameIds: string[] = [];
  const failures: BatchAnalysisResult["failures"] = [];
  let balance: number | null = null;
  let cursor = 0;
  let completed = 0;

  await Promise.all(
    Array.from({ length: Math.min(4, gameIds.length) }, async () => {
      while (cursor < gameIds.length) {
        const gameId = gameIds[cursor++];
        if (!gameId) continue;
        try {
          const game = await fetchArchiveGame(gameId);
          const initialFen = game ? initialFenForGame(game) : null;
          if (!game?.moves?.length || !initialFen) {
            throw new Error("Complete archived moves are unavailable.");
          }
          const result = await requestGameAnalysis(game.game_id, initialFen, game.moves);
          requestedGameIds.push(gameId);
          if (result.balance !== null) {
            balance = balance === null ? result.balance : Math.min(balance, result.balance);
          }
        } catch (error) {
          failures.push({
            gameId,
            message: error instanceof Error ? error.message : "Unable to request analysis.",
          });
        } finally {
          completed += 1;
          onProgress?.(completed, gameIds.length);
        }
      }
    }),
  );

  return { requestedGameIds, balance, failures };
};

export const loadCoveredGameIds = async (gameIds: string[]): Promise<Set<string>> => {
  const statuses = await fetchGameAnalysisStatuses(gameIds);
  return new Set(
    statuses.filter((entry) => analysisAlreadyCovered(entry.status)).map((entry) => entry.gameId),
  );
};
