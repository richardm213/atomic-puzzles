import "./PuzzleMotifDefinition.css";

import { useEffect, useRef, useState } from "react";

import type { PuzzleMotif } from "../../lib/puzzles/puzzleMotifs";
import { motifExamples } from "../../pages/PuzzleMotifs/motifExamples";
import {
  PuzzleMotifExample,
  type ReplayFocusRequest,
} from "../../pages/PuzzleMotifs/PuzzleMotifExample";

export const PuzzleMotifDefinition = ({ motif, name }: { motif: PuzzleMotif; name: string }) => {
  const example = motifExamples[motif.tag];
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<ReplayFocusRequest | null>(null);

  useEffect(() => {
    if (!example) return;
    const dialog = containerRef.current?.closest("dialog");
    if (!dialog || dialog.open) {
      setFocusRequest({ pointer: false });
      return;
    }
    // Native showModal() moves focus after mounting its children. Wait until
    // the dialog is open, then mount/focus the lazy replay instead of a button.
    const observer = new MutationObserver(() => {
      if (!dialog.open) return;
      observer.disconnect();
      setFocusRequest({ pointer: false });
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, [example]);
  return (
    <>
      <p>{motif.description}</p>
      {example ? (
        <div className="puzzleMotifDefinitionExample" ref={containerRef}>
          <PuzzleMotifExample
            key={motif.tag}
            example={example}
            name={name}
            focusRequest={focusRequest}
          />
        </div>
      ) : null}
    </>
  );
};
