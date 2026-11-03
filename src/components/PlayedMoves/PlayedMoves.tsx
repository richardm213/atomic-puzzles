import { useEffect, useRef } from "react";

export type MovePair = {
  number: number;
  white: string | undefined;
  black: string | undefined;
  whitePly: number;
  blackPly: number;
};

export const pairPlayedMoves = (moves: string[]): MovePair[] => {
  const pairs: MovePair[] = [];

  for (let index = 0; index < moves.length; index += 2) {
    pairs.push({
      number: Math.floor(index / 2) + 1,
      white: moves[index],
      black: moves[index + 1],
      whitePly: index + 1,
      blackPly: index + 2,
    });
  }

  return pairs;
};

export const PlayedMoves = ({
  moves,
  currentPly,
  onNavigate,
}: {
  moves: string[];
  currentPly: number;
  onNavigate: (ply: number) => void;
}) => {
  const activeMoveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeMoveRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [currentPly]);

  return (
    <ol className="analysisMoveList" aria-label="Played moves" aria-live="polite">
      {pairPlayedMoves(moves).map((pair) => (
        <li key={pair.number}>
          <span className="analysisMoveNumber">{pair.number}.</span>
          {pair.white ? (
            <button
              ref={currentPly === pair.whitePly ? activeMoveRef : undefined}
              type="button"
              className={currentPly === pair.whitePly ? "active" : ""}
              aria-current={currentPly === pair.whitePly ? "step" : undefined}
              onClick={() => onNavigate(pair.whitePly)}
            >
              {pair.white}
            </button>
          ) : (
            <span />
          )}
          {pair.black ? (
            <button
              ref={currentPly === pair.blackPly ? activeMoveRef : undefined}
              type="button"
              className={currentPly === pair.blackPly ? "active" : ""}
              aria-current={currentPly === pair.blackPly ? "step" : undefined}
              onClick={() => onNavigate(pair.blackPly)}
            >
              {pair.black}
            </button>
          ) : (
            <span />
          )}
        </li>
      ))}
    </ol>
  );
};
