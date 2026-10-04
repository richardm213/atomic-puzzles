import { useEffect } from "react";

export const usePreserveScrollOnSelectChange = (): void => {
  useEffect(() => {
    const preserveScroll = (event: Event): void => {
      if (!(event.target instanceof HTMLSelectElement)) return;

      const pathname = window.location.pathname;
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (window.location.pathname !== pathname) return;
          window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
        });
      });
    };

    document.addEventListener("change", preserveScroll, true);
    return () => document.removeEventListener("change", preserveScroll, true);
  }, []);
};
