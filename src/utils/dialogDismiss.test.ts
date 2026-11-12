import { beforeAll, expect, it, vi } from "vitest";

import { installDialogLightDismiss } from "./dialogDismiss";

beforeAll(installDialogLightDismiss);

const createDialog = (fullscreen = false) => {
  const dialog = document.createElement("dialog");
  dialog.open = true;
  const panel = document.createElement("section");
  dialog.append(panel);
  document.body.append(dialog);
  const bounds = { left: 100, right: 400, top: 100, bottom: 400 } as DOMRect;
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(
    fullscreen ? ({ left: 0, right: 1000, top: 0, bottom: 1000 } as DOMRect) : bounds,
  );
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(bounds);
  if (fullscreen) dialog.setAttribute("data-dialog-backdrop", "");
  const close = vi.fn(() => dialog.removeAttribute("open"));
  dialog.close = close;
  return { dialog, close };
};

const pointer = (target: Element, type: "pointerdown" | "click", coordinate: number) =>
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: coordinate, clientY: coordinate }),
  );

it("dismisses only gestures that start and finish outside the dialog surface", () => {
  const { dialog, close } = createDialog();
  pointer(dialog, "pointerdown", 110);
  pointer(dialog, "click", 110);
  expect(close).not.toHaveBeenCalled();
  pointer(dialog, "pointerdown", 110);
  pointer(dialog, "click", 10);
  expect(close).not.toHaveBeenCalled();
  pointer(dialog, "pointerdown", 10);
  pointer(dialog, "click", 10);
  expect(close).toHaveBeenCalledOnce();
  dialog.remove();
});

it("honors cancellation guards such as an in-flight purchase", () => {
  const { dialog, close } = createDialog();
  const guard = vi.fn((event: Event) => event.preventDefault());
  dialog.addEventListener("cancel", guard);
  pointer(dialog, "pointerdown", 10);
  pointer(dialog, "click", 10);
  expect(guard).toHaveBeenCalledOnce();
  expect(dialog.open).toBe(true);
  expect(close).not.toHaveBeenCalled();
  dialog.remove();
});

it("uses the content panel for dialogs with a fullscreen backdrop", () => {
  const { dialog, close } = createDialog(true);
  pointer(dialog.firstElementChild!, "pointerdown", 110);
  pointer(dialog.firstElementChild!, "click", 110);
  expect(close).not.toHaveBeenCalled();
  pointer(dialog, "pointerdown", 10);
  pointer(dialog, "click", 10);
  expect(close).toHaveBeenCalledOnce();
  dialog.remove();
});
