import { fireEvent, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useBoardActionShortcuts } from "./useBoardActionShortcuts";

it("shares input guards, ignores repeats, uses current callbacks and honors disabled solve mode", () => {
  const first = vi.fn();
  const next = vi.fn();
  const { rerender } = renderHook(
    ({ enabled, run }) =>
      useBoardActionShortcuts(
        { toggleEngine: run, toggleThreat: run, toggleBestMoveArrow: run },
        enabled,
      ),
    { initialProps: { enabled: false, run: first } },
  );
  for (const key of ["l", "x", "a"]) fireEvent.keyDown(window, { key });
  expect(first).not.toHaveBeenCalled();
  rerender({ enabled: true, run: first });
  fireEvent.keyDown(window, { key: "x" });
  expect(first).toHaveBeenCalledOnce();
  rerender({ enabled: true, run: next });
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: "l" });
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  fireEvent.keyDown(dialog, { key: "x" });
  fireEvent.keyDown(window, { key: "a", repeat: true });
  expect(next).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "l" });
  expect(next).toHaveBeenCalledOnce();
  input.remove();
  dialog.remove();
});
