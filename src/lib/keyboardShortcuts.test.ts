import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  keyboardBindingFromEvent,
  keyboardShortcutAction,
  keyboardShortcutSettingsSchema,
} from "./keyboardShortcuts";

it("keeps Shift+arrows separate from board moves and honors custom and disabled bindings", () => {
  const settings = structuredClone(DEFAULT_KEYBOARD_SHORTCUTS);
  expect(
    keyboardShortcutAction(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }),
      settings,
    ),
  ).toBe("nextItem");
  expect(
    keyboardShortcutAction(new KeyboardEvent("keydown", { key: "ArrowRight" }), settings),
  ).toBe("nextMove");
  settings.bindings.nextItem.keys = ["n"];
  expect(keyboardShortcutAction(new KeyboardEvent("keydown", { key: "n" }), settings)).toBe(
    "nextItem",
  );
  expect(
    keyboardShortcutAction(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }),
      settings,
    ),
  ).toBeNull();
  settings.bindings.nextItem.enabled = false;
  expect(keyboardShortcutAction(new KeyboardEvent("keydown", { key: "n" }), settings)).toBeNull();
  settings.enabled = false;
  expect(
    keyboardShortcutAction(new KeyboardEvent("keydown", { key: "ArrowRight" }), settings),
  ).toBeNull();
});

it("normalizes captured modifiers and numpad bindings without capturing focus-navigation keys", () => {
  expect(
    keyboardBindingFromEvent(
      new KeyboardEvent("keydown", { key: "N", shiftKey: true, ctrlKey: true }),
    ),
  ).toBe("Ctrl+Shift+n");
  expect(
    keyboardBindingFromEvent(new KeyboardEvent("keydown", { key: "End", code: "Numpad1" })),
  ).toBe("1");
  expect(keyboardBindingFromEvent(new KeyboardEvent("keydown", { key: "Tab" }))).toBeNull();
  expect(keyboardBindingFromEvent(new KeyboardEvent("keydown", { key: "Shift" }))).toBeNull();
});

it("migrates partial saved settings without losing the remaining default actions", () => {
  const result = keyboardShortcutSettingsSchema.parse({
    bindings: {
      nextItem: { enabled: true, keys: ["n"] },
      pausePractice: { enabled: true, keys: ["a"] },
    },
  });
  expect(result.bindings.nextItem.keys).toEqual(["n"]);
  expect(result.bindings.previousItem.keys).toEqual(["Shift+ArrowLeft"]);
  expect(result.bindings.previousMove.keys).toContain("Backspace");
  expect(keyboardShortcutAction({ key: "a" }, result)).toBe("toggleBestMoveArrow");
  expect(keyboardShortcutAction({ key: "p" }, result)).toBe("pausePractice");
});
