import "./PuzzleStartingFenWarning.css";

import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { startingFenKey } from "../../../shared/domain/puzzles/submissionDuplicates";
import { createPostApi } from "../../lib/api/postApi";
import { appAssetPath } from "../../utils/appAssetPath";

const checkPosition = createPostApi("/api/puzzles/submit", {
  errorMessage: "Unable to check the starting FEN.",
});
const matchSchema = z.object({ puzzleId: z.number().int().positive().nullable() });

export const PuzzleStartingFenWarning = ({ fen }: { fen: string }) => {
  const position = useMemo(() => startingFenKey(fen), [fen]);
  const [match, setMatch] = useState<{ position: string; puzzleId: number | null }>();

  useEffect(() => {
    if (!position) return;
    const controller = new AbortController();
    void checkPosition(
      { action: "starting-fen-match", fen: position },
      { schema: matchSchema, signal: controller.signal },
    )
      .then(({ puzzleId }) => {
        if (!controller.signal.aborted) setMatch({ position, puzzleId });
      })
      .catch(() => {
        // A failed preview must not prevent submission or replace its validation.
      });
    return () => controller.abort();
  }, [position]);

  const puzzleId = match?.position === position ? match.puzzleId : null;
  if (!puzzleId) return null;

  return (
    <div className="puzzleStartingFenWarning" role="status">
      <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
      <div className="puzzleStartingFenWarningCopy">
        <strong>
          Starting FEN matches&nbsp;
          <a href={appAssetPath(`/solve/${puzzleId}`)} target="_blank" rel="noopener noreferrer">
            puzzle {puzzleId}
          </a>
          .
        </strong>
        <span>Compare the solutions to check whether they are meaningfully different.</span>
      </div>
    </div>
  );
};
