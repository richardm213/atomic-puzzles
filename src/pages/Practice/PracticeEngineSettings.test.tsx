import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { PracticeEngineSettings } from "./PracticeEngineSettings";
import { PracticeSettingsProvider, usePracticeSettings } from "./usePracticeSettings";

const key = "atomic-puzzles.practice.settings";
const Harness = () => {
  const { settings, updateSettings } = usePracticeSettings();
  return (
    <PracticeEngineSettings
      value={settings.engine}
      onChange={(engine) => updateSettings({ engine })}
    />
  );
};
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("preserves legacy settings and persists independent strength, style, speed and advanced overrides", () => {
  localStorage.setItem(
    key,
    JSON.stringify({ side: "black", opponentUsername: "HowlinD", continueWithGeneralDb: true }),
  );
  const view = render(
    <PracticeSettingsProvider>
      <Harness />
    </PracticeSettingsProvider>,
  );
  fireEvent.click(screen.getByText("Advanced engine settings"));
  fireEvent.change(screen.getByRole("combobox", { name: /^Preset/ }), {
    target: { value: "materialist" },
  });
  fireEvent.change(screen.getByRole("slider", { name: /^Strength/ }), { target: { value: "12" } });
  expect(screen.getByRole("slider", { name: /^Material preference/ })).toHaveValue("100");
  expect(screen.getByRole("slider", { name: /^Blunder frequency/ })).toHaveValue("0");
  fireEvent.change(screen.getByRole("slider", { name: /^Mistake frequency/ }), {
    target: { value: "20" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /^Preset/ }), {
    target: { value: "quiet" },
  });
  expect(screen.getByRole("slider", { name: /^Mistake frequency/ })).toHaveValue("20");
  fireEvent.change(screen.getByRole("slider", { name: /^Move speed/ }), {
    target: { value: "12" },
  });
  expect(screen.getByRole("spinbutton", { name: /^Maximum think time/ })).toHaveValue(12);
  fireEvent.change(screen.getByRole("spinbutton", { name: /^Switch to engine/ }), {
    target: { value: "5" },
  });
  view.unmount();
  render(
    <PracticeSettingsProvider>
      <Harness />
    </PracticeSettingsProvider>,
  );
  fireEvent.click(screen.getByText("Advanced engine settings"));
  expect(screen.getByRole("slider", { name: /^Strength/ })).toHaveValue("12");
  expect(screen.getByRole("slider", { name: /^Move speed/ })).toHaveValue("12");
  expect(screen.getByRole("slider", { name: /^Mistake frequency/ })).toHaveValue("20");
  expect(screen.getByRole("combobox", { name: /^Preset/ })).toHaveValue("quiet");
  expect(screen.getByRole("spinbutton", { name: /^Switch to engine/ })).toHaveValue(5);
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
    side: "black",
    opponentUsernames: ["HowlinD"],
    playerContinuation: "general",
  });
});

it("allows replacing the game threshold and defaults a cleared field to one on exit", () => {
  const contents = (
    <PracticeSettingsProvider>
      <Harness />
    </PracticeSettingsProvider>
  );
  const view = render(contents);
  const input = screen.getByRole("spinbutton", { name: /^Switch to engine/ });
  fireEvent.change(input, { target: { value: "" } });
  expect(input).toHaveValue(null);
  fireEvent.change(input, { target: { value: "5" } });
  expect(input).toHaveValue(5);
  expect(JSON.parse(localStorage.getItem(key)!).engine.minGames).toBe(5);
  fireEvent.change(input, { target: { value: "" } });
  view.unmount();
  render(contents);
  expect(screen.getByRole("spinbutton", { name: /^Switch to engine/ })).toHaveValue(1);
});
