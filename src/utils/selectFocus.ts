let installed = false;

export const installPointerSelectFocusRelease = (): void => {
  if (installed || typeof document === "undefined") return;
  installed = true;

  let pointerSelect: HTMLSelectElement | null = null;

  document.addEventListener(
    "pointerdown",
    (event) => {
      pointerSelect = event.target instanceof HTMLSelectElement ? event.target : null;
    },
    true,
  );

  document.addEventListener(
    "keydown",
    () => {
      pointerSelect = null;
    },
    true,
  );

  document.addEventListener(
    "change",
    (event) => {
      const select = pointerSelect;
      if (!select || event.target !== select) return;
      select.blur();
      pointerSelect = null;
    },
    true,
  );

  document.addEventListener(
    "blur",
    (event) => {
      if (event.target === pointerSelect) pointerSelect = null;
    },
    true,
  );
};
