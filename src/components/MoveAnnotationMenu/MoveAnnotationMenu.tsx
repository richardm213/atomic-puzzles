import "./MoveAnnotationMenu.css";

import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MOVE_ANNOTATIONS = ["?"] as const;

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
  onSelect?: ((annotation: string) => void) | undefined;
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
      {onSelect
        ? MOVE_ANNOTATIONS.map((annotation) => {
            const checked = current === annotation;
            return (
              <button
                key={annotation}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                aria-label={`Annotate with ${annotation}`}
                className={checked ? "active" : ""}
                onClick={() => {
                  onSelect(checked ? "" : annotation);
                  onClose();
                }}
                title={checked ? `Remove ${annotation} annotation` : `Annotate with ${annotation}`}
              >
                <span aria-hidden="true">{annotation}</span>
              </button>
            );
          })
        : null}
      {onDelete ? (
        <button
          type="button"
          role="menuitem"
          className="danger"
          aria-label="Delete"
          title="Delete"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
        </button>
      ) : null}
    </div>,
    document.body,
  );
};
