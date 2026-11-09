import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppSettingsProvider } from "../../context/AppSettings";
import { KeyboardShortcutSettings } from "./KeyboardShortcutSettings";

it("captures a binding, rejects active conflicts, and lets a disabled action release its key", async () => {
  const user = userEvent.setup();
  localStorage.clear();
  render(
    <AppSettingsProvider>
      <KeyboardShortcutSettings onBack={() => undefined} />
    </AppSettingsProvider>,
  );
  const next = screen.getByRole("textbox", { name: "Next puzzle / game shortcut" });
  await user.click(next);
  await user.keyboard("n");
  expect(next).toHaveValue("N");
  const previous = screen.getByRole("textbox", { name: "Previous puzzle / game shortcut" });
  await user.click(previous);
  await user.keyboard("n");
  expect(screen.getByRole("alert")).toHaveTextContent("Already used");
  await user.click(screen.getByRole("checkbox", { name: "Enable Next puzzle / game" }));
  await user.click(previous);
  await user.keyboard("n");
  expect(previous).toHaveValue("N");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Enable keyboard shortcuts" }));
  const stored = JSON.parse(localStorage.getItem("atomic-puzzles.keyboard-shortcuts")!);
  expect(stored.enabled).toBe(false);
  expect(stored.bindings.nextItem.enabled).toBe(false);
  expect(stored.bindings.previousItem.keys).toEqual(["n"]);
});
