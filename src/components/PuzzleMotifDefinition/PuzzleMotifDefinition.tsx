import "./PuzzleMotifDefinition.css";

import type { PuzzleMotif } from "../../lib/puzzles/puzzleMotifs";
import { motifExamples } from "../../pages/PuzzleMotifs/motifExamples";
import { PuzzleMotifExample } from "../../pages/PuzzleMotifs/PuzzleMotifExample";

export const PuzzleMotifDefinition = ({ motif, name }: { motif: PuzzleMotif; name: string }) => {
  const example = motifExamples[motif.tag];
  return (
    <>
      <p>{motif.description}</p>
      {example ? (
        <div className="puzzleMotifDefinitionExample">
          <PuzzleMotifExample key={motif.tag} example={example} name={name} focusRequest={null} />
        </div>
      ) : null}
    </>
  );
};
