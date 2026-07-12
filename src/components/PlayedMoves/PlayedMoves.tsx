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
}) => (
  <ol className="analysisMoveList" aria-label="Played moves" aria-live="polite">
    {pairPlayedMoves(moves).map((pair) => (
      <li key={pair.number}>
        <span className="analysisMoveNumber">{pair.number}.</span>
        {pair.white ? (
          <button
            type="button"
            className={currentPly === pair.whitePly ? "active" : ""}
            onClick={() => onNavigate(pair.whitePly)}
          >
            {pair.white}
          </button>
        ) : (
          <span />
        )}
        {pair.black ? (
          <button
            type="button"
            className={currentPly === pair.blackPly ? "active" : ""}
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
