import { useCallback } from "react";
import { z } from "zod";

import { usePersistedState } from "../../hooks/usePersistedState";

const PRACTICE_SETTINGS_STORAGE_KEY = "atomic-puzzles.practice.settings";
export const MAX_PRACTICE_PLAYERS = 8;
export const DEFAULT_CLOCK_MINUTES = 3;
const DEFAULT_CLOCK_INCREMENT_SECONDS = 0;

export type PracticeSide = "white" | "black";
export type OpponentMode = "frequency" | "random" | "popular";
export type OpponentSource = "general" | "player";
export type PlayerContinuation = "general" | "stockfish" | "manual";

export type StoredPracticeSettings = {
  side: PracticeSide;
  opponentMode: OpponentMode;
  opponentSource: OpponentSource;
  opponentUsernames: string[];
  opponentUsername?: string;
  allowMultiplePlayers: boolean;
  playerContinuation: PlayerContinuation;
  continueWithGeneralDb?: boolean;
  clockMinutes: number;
  clockIncrementSeconds: number;
  clockEnabled: boolean;
};

const DEFAULT_SETTINGS: StoredPracticeSettings = {
  side: "white",
  opponentMode: "frequency",
  opponentSource: "general",
  opponentUsernames: [],
  allowMultiplePlayers: false,
  playerContinuation: "stockfish",
  clockMinutes: DEFAULT_CLOCK_MINUTES,
  clockIncrementSeconds: DEFAULT_CLOCK_INCREMENT_SECONDS,
  clockEnabled: true,
};

export const normalizeClockValue = (value: unknown, fallback: number, maximum: number): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(numericValue)));
};

export const normalizePracticeUsernames = (value: unknown): string[] => {
  const usernames = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seenUsernames = new Set<string>();
  return usernames
    .map((username) => String(username).trim())
    .filter((username) => {
      if (!username) return false;
      const normalizedUsername = username.toLowerCase();
      if (seenUsernames.has(normalizedUsername)) return false;
      seenUsernames.add(normalizedUsername);
      return true;
    })
    .slice(0, MAX_PRACTICE_PLAYERS);
};

const practiceSettingsSchema = z
  .record(z.string(), z.unknown())
  .transform((value): StoredPracticeSettings => {
    const allowMultiplePlayers = value.allowMultiplePlayers === true;
    const opponentUsernames = normalizePracticeUsernames(
      Array.isArray(value.opponentUsernames) && value.opponentUsernames.length
        ? value.opponentUsernames
        : value.opponentUsername,
    );

    return {
      side: value.side === "black" ? "black" : "white",
      opponentMode:
        value.opponentMode === "random" || value.opponentMode === "popular"
          ? value.opponentMode
          : "frequency",
      opponentSource: value.opponentSource === "player" ? "player" : "general",
      opponentUsernames: allowMultiplePlayers ? opponentUsernames : opponentUsernames.slice(0, 1),
      allowMultiplePlayers,
      playerContinuation:
        value.playerContinuation === "manual"
          ? "manual"
          : value.playerContinuation === "general" || value.continueWithGeneralDb === true
            ? "general"
            : "stockfish",
      clockMinutes: normalizeClockValue(value.clockMinutes, DEFAULT_CLOCK_MINUTES, 180),
      clockIncrementSeconds: normalizeClockValue(
        value.clockIncrementSeconds,
        DEFAULT_CLOCK_INCREMENT_SECONDS,
        60,
      ),
      clockEnabled: value.clockEnabled !== false,
    };
  });

export const usePracticeSettings = () => {
  const [settings, setSettings] = usePersistedState<StoredPracticeSettings>(
    PRACTICE_SETTINGS_STORAGE_KEY,
    practiceSettingsSchema,
    DEFAULT_SETTINGS,
  );
  const updateSettings = useCallback(
    (patch: Partial<StoredPracticeSettings>): void =>
      setSettings((current) => ({ ...current, ...patch })),
    [setSettings],
  );

  return { settings, setSettings, updateSettings };
};
