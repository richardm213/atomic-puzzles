let installed = false;

// Use the same cancel path as Escape, including each dialog's pending-action guards.
export const installDialogLightDismiss = (): void => {
  if (installed || typeof document === "undefined") return;
  installed = true;
  let pressedBackdrop: HTMLDialogElement | null = null;

  const backdropDialog = (event: MouseEvent): HTMLDialogElement | null => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open || event.button !== 0) return null;
    const surface = dialog.hasAttribute("data-dialog-backdrop") ? dialog.firstElementChild : dialog;
    if (!surface) return null;
    const { left, right, top, bottom } = surface.getBoundingClientRect();
    return event.clientX < left ||
      event.clientX > right ||
      event.clientY < top ||
      event.clientY > bottom
      ? dialog
      : null;
  };

  document.addEventListener(
    "pointerdown",
    (event) => {
      pressedBackdrop = backdropDialog(event);
    },
    true,
  );
  document.addEventListener(
    "pointercancel",
    () => {
      pressedBackdrop = null;
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      const dialog = pressedBackdrop;
      pressedBackdrop = null;
      if (
        dialog &&
        backdropDialog(event) === dialog &&
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }))
      )
        dialog.close();
    },
    true,
  );
};
