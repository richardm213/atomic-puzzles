import type { Key } from "@lichess-org/chessground/types";
import type { Color } from "chessops";
import { useRef, useState } from "react";

const arrows: Record<string, readonly [number, number]> = {
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
};

export const BlindMoveSquares = ({
  orientation,
  getLegalDestinations,
  onSelect,
  onMove,
  onIllegalMove,
}: {
  orientation: Color;
  getLegalDestinations: (from: Key) => readonly Key[];
  onSelect: (square: Key | null) => void;
  onMove: (from: Key, to: Key) => void;
  onIllegalMove: () => void;
}) => {
  const [focused, setFocused] = useState(0);
  const [origin, setOrigin] = useState<Key | null>(null);
  const squares = useRef<Array<HTMLButtonElement | null>>([]);
  const files = orientation === "white" ? "abcdefgh" : "hgfedcba";
  const ranks = orientation === "white" ? "87654321" : "12345678";

  const select = (square: Key | null) => {
    setOrigin(square);
    onSelect(square);
  };

  return (
    <div className="blindMoveSquares" role="group" aria-label="Blind move squares">
      {Array.from({ length: 64 }, (_, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const square = `${files[col]}${ranks[row]}` as Key;
        return (
          <button
            key={square}
            ref={(button) => {
              squares.current[index] = button;
            }}
            type="button"
            aria-label={square}
            aria-pressed={origin === square}
            tabIndex={focused === index ? 0 : -1}
            onFocus={() => setFocused(index)}
            onClick={() => {
              if (origin && getLegalDestinations(origin).includes(square)) {
                select(null);
                onMove(origin, square);
              } else {
                const nextOrigin =
                  origin !== square && getLegalDestinations(square).length ? square : null;
                select(nextOrigin);
                if (origin && origin !== square && !nextOrigin) onIllegalMove();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") select(null);
              const direction = arrows[event.key];
              if (!direction) return;
              event.preventDefault();
              const [dy, dx] = direction;
              const nextRow = Math.max(0, Math.min(7, row + dy));
              const nextCol = Math.max(0, Math.min(7, col + dx));
              squares.current[nextRow * 8 + nextCol]?.focus();
            }}
          />
        );
      })}
    </div>
  );
};
