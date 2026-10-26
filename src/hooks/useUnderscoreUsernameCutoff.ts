import { useEffect, useRef, useState } from "react";

export const useUnderscoreUsernameCutoff = <T extends HTMLElement>(username: string) => {
  const elementRef = useRef<T | null>(null);
  const [displayName, setDisplayName] = useState(username);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !username.includes("_")) {
      setDisplayName(username);
      return undefined;
    }

    const updateDisplayName = () => {
      const availableWidth = element.clientWidth;
      if (!availableWidth) return;

      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;

      const styles = window.getComputedStyle(element);
      context.font = styles.font;
      const letterSpacing = Number.parseFloat(styles.letterSpacing) || 0;
      const textWidth = (value: string) =>
        context.measureText(value).width + Math.max(0, value.length - 1) * letterSpacing;

      let nextDisplayName = username;
      if (textWidth(username) > availableWidth) {
        const underscoreIndexes = Array.from(
          username.matchAll(/_/g),
          (match) => match.index,
        ).reverse();
        const fittingPrefix = underscoreIndexes
          .map((index) => username.slice(0, index))
          .find((candidate) => textWidth(candidate) <= availableWidth);

        if (fittingPrefix) nextDisplayName = fittingPrefix;
      }

      setDisplayName((currentName) =>
        currentName === nextDisplayName ? currentName : nextDisplayName,
      );
    };

    updateDisplayName();
    const resizeObserver = new ResizeObserver(updateDisplayName);
    resizeObserver.observe(element.parentElement || element);

    return () => resizeObserver.disconnect();
  }, [username]);

  return { displayName, elementRef };
};
