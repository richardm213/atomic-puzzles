// Run before first paint. Keep the storage fallback and root attributes in sync with AppSettings.
(() => {
  const gemstones = ["amethyst", "ruby", "emerald"];
  const readSetting = (key) => {
    const value = window.localStorage.getItem(key);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  try {
    let { theme, colorMode } = readSetting("atomic-puzzles.site-appearance") ?? {};
    if (
      !["default", ...gemstones, "black"].includes(theme) ||
      !["dark", "light"].includes(colorMode)
    ) {
      const legacy = readSetting("atomic-puzzles.theme");
      theme = gemstones.includes(legacy) ? legacy : "default";
      colorMode = legacy === "light" ? "light" : "dark";
    }

    const root = document.documentElement;
    root.dataset.theme = theme === "black" ? "dark" : colorMode;
    root.dataset.palette = theme;
    root.toggleAttribute("data-gemstone-theme", gemstones.includes(theme));
  } catch {
    // The HTML default still works if the browser blocks local storage.
  }
})();
