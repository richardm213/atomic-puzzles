import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { PracticeEngineSettings } from "./PracticeEngineSettings";
import { usePracticeSettings } from "./usePracticeSettings";

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
  const view = render(<Harness />);
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
  fireEvent.change(screen.getByRole("slider", { name: /^Move speed/ }), { target: { value: "8" } });
  expect(screen.getByRole("spinbutton", { name: /^Maximum think time/ })).toHaveValue(6);
  fireEvent.change(screen.getByRole("spinbutton", { name: /^Switch to engine/ }), {
    target: { value: "5" },
  });
  view.unmount();
  render(<Harness />);
  fireEvent.click(screen.getByText("Advanced engine settings"));
  expect(screen.getByRole("slider", { name: /^Strength/ })).toHaveValue("12");
  expect(screen.getByRole("slider", { name: /^Mistake frequency/ })).toHaveValue("20");
  expect(screen.getByRole("combobox", { name: /^Preset/ })).toHaveValue("quiet");
  expect(screen.getByRole("spinbutton", { name: /^Switch to engine/ })).toHaveValue(5);
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
    side: "black",
    opponentUsernames: ["HowlinD"],
    playerContinuation: "general",
  });
});
