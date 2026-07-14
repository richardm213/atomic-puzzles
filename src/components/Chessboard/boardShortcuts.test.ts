import { boardShortcutCommand } from "./boardShortcuts";

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
