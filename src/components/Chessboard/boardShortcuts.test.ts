import {
  boardShortcutCommand,
  isTextEntryTarget,
  shortcutIndexFromKeyboardEvent,
} from "./boardShortcuts";

describe("boardShortcutCommand", () => {
  it("maps board navigation keys", () => {
    expect(boardShortcutCommand(new KeyboardEvent("keydown", { key: "ArrowUp" }))).toBe(
      "previousOption",
    );
    expect(boardShortcutCommand(new KeyboardEvent("keydown", { key: "ArrowDown" }))).toBe(
      "nextOption",
    );
    expect(boardShortcutCommand(new KeyboardEvent("keydown", { key: "Backspace" }))).toBe(
      "previous",
    );
  });

  it("ignores modified shortcuts and interactive controls", () => {
    const button = document.createElement("button");
    expect(
      boardShortcutCommand({
        key: "ArrowLeft",
        target: button,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      }),
    ).toBeNull();
    expect(
      boardShortcutCommand(new KeyboardEvent("keydown", { key: "ArrowLeft", metaKey: true })),
    ).toBeNull();
  });

  it("captures focused solution buttons when requested", () => {
    const button = document.createElement("button");
    expect(
      boardShortcutCommand(
        {
          key: "ArrowRight",
          target: button,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
        },
        true,
      ),
    ).toBe("next");
  });
});

describe("shortcutIndexFromKeyboardEvent", () => {
  it("maps Space, digit, and numpad shortcuts", () => {
    expect(shortcutIndexFromKeyboardEvent({ key: " ", code: "Space" })).toBe(0);
    expect(shortcutIndexFromKeyboardEvent({ key: "4", code: "Digit4" })).toBe(3);
    expect(shortcutIndexFromKeyboardEvent({ key: "End", code: "Numpad1" })).toBe(0);
    expect(shortcutIndexFromKeyboardEvent({ key: "0", code: "Digit0" })).toBeNull();
  });
});

describe("isTextEntryTarget", () => {
  it("recognizes form fields and editable elements", () => {
    expect(isTextEntryTarget(document.createElement("input"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("button"))).toBe(false);

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isTextEntryTarget(editable)).toBe(true);
  });
});
