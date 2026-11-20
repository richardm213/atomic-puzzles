import "./PuzzleAttemptResult.css";

import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  type PuzzleAttemptColor,
  puzzleAttemptColorExplanation,
} from "../../../shared/domain/puzzles/puzzleGrading";

export const PuzzleAttemptResult = ({
  color,
  correct,
  solved = correct,
  move,
  hideAnswers = false,
}: {
  color: PuzzleAttemptColor;
  correct: boolean;
  solved?: boolean;
  move?: string | null;
  hideAnswers?: boolean;
}) => (
  <span
    className={`puzzleOtherAttemptResult ${color === "red" && solved ? "lateSolve" : color}`}
    tabIndex={0}
    title={puzzleAttemptColorExplanation(color, solved)}
    aria-label={puzzleAttemptColorExplanation(color, solved)}
  >
    <FontAwesomeIcon
      icon={correct ? faCheck : faXmark}
      aria-hidden={hideAnswers}
      aria-label={hideAnswers ? undefined : correct ? "Correct" : "Incorrect"}
    />
    {!hideAnswers && move ? (
      <span className="puzzleOtherAttemptMove" aria-label={`Played ${move}`}>
        {move}
      </span>
    ) : null}
  </span>
);
