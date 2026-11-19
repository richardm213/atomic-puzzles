import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { AppSettingsProvider } from "../../context/AppSettings";
import { usePracticeSettings } from "../../pages/Practice/usePracticeSettings";
import { EngineSettings } from "./EngineSettings";

it("shares changes with practice immediately and restores engine preferences after remounting", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ json: async () => ({ available: false }) })),
  );
  localStorage.clear();
  const ReadPractice = () => {
    const { settings } = usePracticeSettings();
    return <output data-testid="practice-speed">{settings.engine.speed}</output>;
  };
  const contents = (
    <AppSettingsProvider>
      <EngineSettings practice />
      <ReadPractice />
    </AppSettingsProvider>
  );
  const view = render(contents);
  fireEvent.change(screen.getByRole("slider", { name: /^Move speed/ }), {
    target: { value: "12" },
  });
  expect(screen.getByTestId("practice-speed")).toHaveTextContent("12");
  const arrow = screen.getByRole("checkbox", { name: "Best move arrow" }) as HTMLInputElement;
  const checked = !arrow.checked;
  fireEvent.click(arrow);
  fireEvent.change(screen.getByRole("combobox", { name: "Analysis engine" }), {
    target: { value: "fairy-stockfish-14" },
  });
  view.unmount();
  render(contents);
  expect(screen.getByRole("slider", { name: /^Move speed/ })).toHaveValue("12");
  expect(screen.getByRole("combobox", { name: "Analysis engine" })).toHaveValue(
    "fairy-stockfish-14",
  );
  expect(
    (screen.getByRole("checkbox", { name: "Best move arrow" }) as HTMLInputElement).checked,
  ).toBe(checked);
  vi.unstubAllGlobals();
});

it("selects the local human model and remembers independently editable ratings", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ models: { human: true, rechesster: true } }) })),
  );
  localStorage.clear();
  const contents = (
    <AppSettingsProvider>
      <EngineSettings practice />
    </AppSettingsProvider>
  );
  const view = render(contents);
  await screen.findByRole("option", { name: "Human model (local)" });
  fireEvent.change(screen.getByRole("combobox", { name: "Opponent" }), {
    target: { value: "human" },
  });
  const engine = screen.getByRole("spinbutton", { name: "Engine target rating" });
  expect(engine).toHaveValue(2300);
  fireEvent.change(engine, { target: { value: "1" } });
  expect(engine).toHaveValue(1);
  fireEvent.change(engine, { target: { value: "1600" } });
  fireEvent.click(screen.getByText("Advanced", { exact: true }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Assumed opponent rating" }), {
    target: { value: "2200" },
  });
  view.unmount();
  render(contents);
  await screen.findByRole("option", { name: "Human model (local)" });
  expect(screen.getByRole("combobox", { name: "Opponent" })).toHaveValue("human");
  expect(screen.getByRole("spinbutton", { name: "Engine target rating" })).toHaveValue(1600);
  fireEvent.click(screen.getByText("Advanced", { exact: true }));
  expect(screen.getByRole("spinbutton", { name: "Assumed opponent rating" })).toHaveValue(2200);
  vi.unstubAllGlobals();
});
