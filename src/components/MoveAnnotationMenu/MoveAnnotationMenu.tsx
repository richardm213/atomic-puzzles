import "./MoveAnnotationMenu.css";

import { useEffect, useRef } from "react";

export const MOVE_ANNOTATIONS = ["", "!", "?", "!!", "??", "!?", "?!"] as const;

const ANNOTATION_LABELS: Record<(typeof MOVE_ANNOTATIONS)[number], string> = {
  "": "No annotation",
  "!": "Good move",
  "?": "Mistake",
  "!!": "Brilliant move",
  "??": "Blunder",
  "!?": "Interesting move",
  "?!": "Dubious move",
};

export type AnnotationMenuPosition = { x: number; y: number };

export const annotationMenuPosition = (
  event: React.MouseEvent<HTMLButtonElement>,
): AnnotationMenuPosition => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || rect.left;
  const y = event.clientY || rect.bottom;
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 220)),
    y: Math.max(8, Math.min(y, window.innerHeight - 176)),
  };
};

export const MoveAnnotationMenu = ({
  position,
  current,
  onSelect,
  onClose,
}: {
  position: AnnotationMenuPosition;
  current: string;
  onSelect: (annotation: string) => void;
  onClose: () => void;
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handlePointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="moveAnnotationMenu"
      role="menu"
      aria-label="Move annotation"
      style={{ left: position.x, top: position.y }}
    >
      {MOVE_ANNOTATIONS.map((annotation) => (
        <button
          key={annotation || "none"}
          type="button"
          role="menuitemradio"
          aria-checked={current === annotation}
          aria-label={`${annotation || "–"} ${ANNOTATION_LABELS[annotation]}`}
          className={current === annotation ? "active" : ""}
          onClick={() => onSelect(annotation)}
        >
          <span>{annotation || "–"}</span>
          {ANNOTATION_LABELS[annotation]}
        </button>
      ))}
    </div>
  );
};
