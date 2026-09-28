import { z } from "zod";

import { usePersistedState } from "./usePersistedState";

const ENGINE_SETTINGS_STORAGE_KEY = "atomic-puzzles.atomicdb-engine";
const DEFAULT_ENGINE_SETTINGS = { enabled: true, lineCount: 3 };

export type AtomicDbEngineSettings = typeof DEFAULT_ENGINE_SETTINGS;

const engineSettingsSchema = (defaultEnabled: boolean) =>
  z.record(z.string(), z.unknown()).transform((value): AtomicDbEngineSettings => {
    const parsedCount = Math.floor(Number(value.lineCount));
    const lineCount = Number.isFinite(parsedCount) ? Math.min(5, Math.max(1, parsedCount)) : 3;
    const enabled = typeof value.enabled === "boolean" ? value.enabled : defaultEnabled;
    return { enabled, lineCount };
  });

export const useAtomicDbEngineSettings = ({
  storageKey = ENGINE_SETTINGS_STORAGE_KEY,
  defaultEnabled = true,
}: {
  storageKey?: string;
  defaultEnabled?: boolean;
} = {}) =>
  usePersistedState<AtomicDbEngineSettings>(storageKey, engineSettingsSchema(defaultEnabled), {
    ...DEFAULT_ENGINE_SETTINGS,
    enabled: defaultEnabled,
  });
