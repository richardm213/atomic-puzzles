import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { z } from "zod";

import { usePersistedState } from "../../hooks/usePersistedState";
import {
  DEFAULT_PRACTICE_MOVE_SETTINGS,
  normalizePracticeEngineSettings,
  type PracticeEngineSettings,
} from "../../lib/practice/engineSettings";

const PRACTICE_SETTINGS_STORAGE_KEY = "atomic-puzzles.practice.settings";
export const MAX_PRACTICE_PLAYERS = 8;
const DEFAULT_CLOCK_MINUTES = 3;
const DEFAULT_CLOCK_INCREMENT_SECONDS = 0;

export type PracticeSide = "white" | "black";
export type OpponentMode = "frequency" | "random" | "popular";
export type OpponentSource = "general" | "player";
export type PlayerContinuation = "general" | "engine";

type StoredPracticeSettings = {
  engine: PracticeEngineSettings;
  opponentModel: "database" | "rechesster";
  side: PracticeSide;
  opponentMode: OpponentMode;
  opponentSource: OpponentSource;
  opponentUsernames: string[];
  opponentUsername?: string;
  allowMultiplePlayers: boolean;
  playerContinuation: PlayerContinuation;
  showPerformance: boolean;
  continueWithGeneralDb?: boolean;
  clockMinutes: number;
  clockIncrementSeconds: number;
  clockEnabled: boolean;
};

const DEFAULT_SETTINGS: StoredPracticeSettings = {
  ...DEFAULT_PRACTICE_MOVE_SETTINGS,
  side: "white",
  opponentModel: "database",
  opponentSource: "general",
  opponentUsernames: [],
  allowMultiplePlayers: false,
  showPerformance: false,
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
      engine: normalizePracticeEngineSettings(value.engine),
      opponentModel:
        import.meta.env.DEV && value.opponentModel === "rechesster" ? "rechesster" : "database",
      side: value.side === "black" ? "black" : "white",
      opponentMode:
        value.opponentMode === "random" || value.opponentMode === "popular"
          ? value.opponentMode
          : "frequency",
      opponentSource: value.opponentSource === "player" ? "player" : "general",
      opponentUsernames: allowMultiplePlayers ? opponentUsernames : opponentUsernames.slice(0, 1),
      allowMultiplePlayers,
      // Migrate the former Manual and Stockfish choices to the shared engine path. The General DB
      // preference remains intact for people who already selected it.
      playerContinuation:
        value.playerContinuation === "general" || value.continueWithGeneralDb === true
          ? "general"
          : "engine",
      showPerformance: value.showPerformance === true,
      clockMinutes: normalizeClockValue(value.clockMinutes, DEFAULT_CLOCK_MINUTES, 180),
      clockIncrementSeconds: normalizeClockValue(
        value.clockIncrementSeconds,
        DEFAULT_CLOCK_INCREMENT_SECONDS,
        60,
      ),
      clockEnabled: value.clockEnabled !== false,
    };
  });

const usePracticeSettingsState = () => {
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

  return useMemo(
    () => ({ settings, setSettings, updateSettings }),
    [settings, setSettings, updateSettings],
  );
};

const PracticeSettingsContext = createContext<ReturnType<typeof usePracticeSettingsState> | null>(
  null,
);
export const PracticeSettingsProvider = ({ children }: { children: ReactNode }) =>
  createElement(PracticeSettingsContext.Provider, { value: usePracticeSettingsState() }, children);
export const usePracticeSettings = () => {
  const settings = useContext(PracticeSettingsContext);
  if (!settings) throw new Error("Practice settings require PracticeSettingsProvider");
  return settings;
};
