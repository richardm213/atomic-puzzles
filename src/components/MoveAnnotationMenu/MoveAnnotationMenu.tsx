import "./MoveAnnotationMenu.css";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

export type AnnotationMenuPosition = { left: number; top: number; bottom: number };

export const annotationMenuPosition = (
  event: React.MouseEvent<HTMLButtonElement>,
): AnnotationMenuPosition => {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    bottom: rect.bottom,
  };
};

export const MoveAnnotationMenu = ({
  position,
  current,
  onSelect,
  onDelete,
  onClose,
}: {
  position: AnnotationMenuPosition;
  current: string;
  onSelect: (annotation: string) => void;
  onDelete?: (() => void) | undefined;
  onClose: () => void;
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coordinates, setCoordinates] = useState({ left: position.left, top: position.bottom + 6 });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const gutter = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const fitsBelow = position.bottom + 6 + height <= window.innerHeight - gutter;
    setCoordinates({
      left: Math.max(gutter, Math.min(position.left, window.innerWidth - width - gutter)),
      top: fitsBelow
        ? position.bottom + 6
        : Math.max(
            gutter,
            Math.min(position.top - height - 6, window.innerHeight - height - gutter),
          ),
    });
  }, [position]);

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

  return createPortal(
    <div
      ref={menuRef}
      className="moveAnnotationMenu"
      role="menu"
      aria-label="Move annotation"
      style={coordinates}
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
      {onDelete ? (
        <button type="button" role="menuitem" className="danger" onClick={onDelete}>
          <span aria-hidden="true">×</span>
          Delete from here
        </button>
      ) : null}
    </div>,
    document.body,
  );
};
