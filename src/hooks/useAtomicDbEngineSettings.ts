import { z } from "zod";

import { usePersistedState } from "./usePersistedState";

const ENGINE_SETTINGS_STORAGE_KEY = "atomic-puzzles.atomicdb-engine";
const ENGINE_SETTINGS_VERSION = 2;

export type AtomicDbEngineSettings = {
  enabled: boolean;
  atomicDbEnabled?: boolean;
  lineCount: number;
  showFollowUpMoves: boolean;
  settingsVersion?: typeof ENGINE_SETTINGS_VERSION;
};

const mobileDefaultLineCount = (): number =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 780px)").matches
    ? 2
    : 3;

const engineSettingsSchema = (defaultEnabled: boolean, defaultLineCount: number) =>
  z.record(z.string(), z.unknown()).transform((value): AtomicDbEngineSettings => {
    const parsedCount = Math.floor(Number(value.lineCount));
    const storedVersion = Number(value.settingsVersion);
    const legacyDefaultCount = storedVersion < ENGINE_SETTINGS_VERSION && parsedCount === 3;
    const lineCount = Number.isFinite(parsedCount)
      ? legacyDefaultCount
        ? defaultLineCount
        : Math.min(5, Math.max(1, parsedCount))
      : defaultLineCount;
    const enabled = typeof value.enabled === "boolean" ? value.enabled : defaultEnabled;
    const atomicDbEnabled =
      typeof value.atomicDbEnabled === "boolean" ? value.atomicDbEnabled : true;
    const showFollowUpMoves =
      typeof value.showFollowUpMoves === "boolean" ? value.showFollowUpMoves : true;
    return {
      enabled,
      atomicDbEnabled,
      lineCount,
      showFollowUpMoves,
      settingsVersion: ENGINE_SETTINGS_VERSION,
    };
  });

export const useAtomicDbEngineSettings = ({
  storageKey = ENGINE_SETTINGS_STORAGE_KEY,
  defaultEnabled = true,
}: {
  storageKey?: string;
  defaultEnabled?: boolean;
} = {}) => {
  const defaultLineCount = mobileDefaultLineCount();
  return usePersistedState<AtomicDbEngineSettings>(
    storageKey,
    engineSettingsSchema(defaultEnabled, defaultLineCount),
    {
      enabled: defaultEnabled,
      atomicDbEnabled: true,
      lineCount: defaultLineCount,
      showFollowUpMoves: true,
      settingsVersion: ENGINE_SETTINGS_VERSION,
    },
  );
};
