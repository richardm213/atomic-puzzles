import { z } from "zod";

export const keyboardShortcutDefinitions = {
  previousMove: {
    label: "Previous move",
    section: "Board navigation",
    keys: ["ArrowLeft", "Backspace"],
  },
  nextMove: { label: "Next move", section: "Board navigation", keys: ["ArrowRight"] },
  previousLine: { label: "Previous variation", section: "Board navigation", keys: ["ArrowUp"] },
  nextLine: { label: "Next variation", section: "Board navigation", keys: ["ArrowDown"] },
  previousItem: {
    label: "Previous puzzle / game",
    section: "Board navigation",
    keys: ["Shift+ArrowLeft"],
  },
  nextItem: {
    label: "Next puzzle / game",
    section: "Board navigation",
    keys: ["Shift+ArrowRight"],
  },
  flipBoard: { label: "Flip board", section: "Analysis and practice", keys: ["f"] },
  toggleExplorer: {
    label: "Toggle opening explorer",
    section: "Analysis and practice",
    keys: ["e"],
  },
  toggleEngine: { label: "Toggle engine", section: "Analysis and practice", keys: ["l"] },
  toggleGameAnalysis: {
    label: "Toggle game analysis",
    section: "Analysis and practice",
    keys: ["z"],
  },
  toggleFollowUps: {
    label: "Toggle follow-up moves",
    section: "Analysis and practice",
    keys: ["k"],
  },
  toggleThreat: { label: "Toggle threat analysis", section: "Analysis and practice", keys: ["x"] },
  playBestMove: { label: "Play best move", section: "Analysis and practice", keys: ["Space"] },
  toggleBestMoveArrow: {
    label: "Toggle best move arrow",
    section: "Analysis and practice",
    keys: ["a"],
  },
  pausePractice: {
    label: "Pause / resume practice",
    section: "Analysis and practice",
    keys: ["p"],
  },
  alternatePracticeMove: {
    label: "Alternate practice move",
    section: "Analysis and practice",
    keys: ["q"],
  },
  explorerMove1: { label: "Explorer move 1", section: "Explorer moves", keys: ["1"] },
  explorerMove2: { label: "Explorer move 2", section: "Explorer moves", keys: ["2"] },
  explorerMove3: { label: "Explorer move 3", section: "Explorer moves", keys: ["3"] },
  explorerMove4: { label: "Explorer move 4", section: "Explorer moves", keys: ["4"] },
  explorerMove5: { label: "Explorer move 5", section: "Explorer moves", keys: ["5"] },
  explorerMove6: { label: "Explorer move 6", section: "Explorer moves", keys: ["6"] },
  explorerMove7: { label: "Explorer move 7", section: "Explorer moves", keys: ["7"] },
  explorerMove8: { label: "Explorer move 8", section: "Explorer moves", keys: ["8"] },
  explorerMove9: { label: "Explorer move 9", section: "Explorer moves", keys: ["9"] },
} as const;

export type KeyboardShortcutAction = keyof typeof keyboardShortcutDefinitions;
export const keyboardShortcutActions = Object.keys(
  keyboardShortcutDefinitions,
) as KeyboardShortcutAction[];
export type KeyboardShortcutSettings = {
  enabled: boolean;
  bindings: Record<KeyboardShortcutAction, { enabled: boolean; keys: string[] }>;
};
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcutSettings = {
  enabled: true,
  bindings: Object.fromEntries(
    keyboardShortcutActions.map((action) => [
      action,
      {
        enabled: true,
        keys: [...keyboardShortcutDefinitions[action].keys],
      },
    ]),
  ) as KeyboardShortcutSettings["bindings"],
};
const bindingSchema = z.object({
  enabled: z.boolean(),
  keys: z.array(z.string().min(1).max(64)).min(1).max(2),
});
export const keyboardShortcutSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    bindings: z
      .partialRecord(
        z.enum(keyboardShortcutActions as [KeyboardShortcutAction, ...KeyboardShortcutAction[]]),
        bindingSchema,
      )
      .default({}),
  })
  .transform((settings): KeyboardShortcutSettings => {
    const bindings = { ...DEFAULT_KEYBOARD_SHORTCUTS.bindings, ...settings.bindings };
    const savedPause = settings.bindings.pausePractice;
    if (!settings.bindings.toggleBestMoveArrow && savedPause?.keys.includes("a")) {
      const remainingKeys = savedPause.keys.filter((key) => key !== "a");
      bindings.pausePractice = {
        ...savedPause,
        keys: remainingKeys.length
          ? remainingKeys
          : [...keyboardShortcutDefinitions.pausePractice.keys],
      };
    }
    return { enabled: settings.enabled, bindings };
  });

type ShortcutEvent = Pick<KeyboardEvent, "key"> &
  Partial<Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">>;
export const keyboardBindingFromEvent = (event: ShortcutEvent): string | null => {
  if (
    [
      "Shift",
      "Control",
      "Alt",
      "Meta",
      "Tab",
      "Escape",
      "Dead",
      "Process",
      "Unidentified",
    ].includes(event.key)
  )
    return null;
  let key =
    event.key === " " || event.key.toLowerCase() === "spacebar"
      ? "Space"
      : event.key.length === 1
        ? event.key.toLowerCase()
        : event.key;
  if (/^Numpad[1-9]$/.test(event.code ?? "")) key = event.code!.slice(-1);
  return [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Meta",
    key,
  ]
    .filter(Boolean)
    .join("+");
};
export const keyboardShortcutAction = (
  event: ShortcutEvent,
  settings = DEFAULT_KEYBOARD_SHORTCUTS,
): KeyboardShortcutAction | null => {
  if (!settings.enabled) return null;
  const key = keyboardBindingFromEvent(event);
  if (!key) return null;
  return (
    keyboardShortcutActions.find(
      (action) => settings.bindings[action].enabled && settings.bindings[action].keys.includes(key),
    ) ?? null
  );
};
export const formatKeyboardBinding = (binding: string): string =>
  binding
    .split("+")
    .map(
      (key) =>
        ({
          ArrowLeft: "←",
          ArrowRight: "→",
          ArrowUp: "↑",
          ArrowDown: "↓",
          Meta: "Meta",
        })[key] ?? (key.length === 1 ? key.toUpperCase() : key),
    )
    .join(" + ");
export const keyboardShortcutHint = (
  settings: KeyboardShortcutSettings,
  action: KeyboardShortcutAction,
): string =>
  settings.enabled && settings.bindings[action].enabled
    ? settings.bindings[action].keys.map(formatKeyboardBinding).join(" / ")
    : "";
export const keyboardShortcutAria = (
  settings: KeyboardShortcutSettings,
  action: KeyboardShortcutAction,
): string | undefined =>
  settings.enabled && settings.bindings[action].enabled
    ? settings.bindings[action].keys.map((key) => key.replace(/Ctrl/g, "Control")).join(" ")
    : undefined;
