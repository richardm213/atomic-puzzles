import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type PuzzleAnalysisInstructionsProps = {
  title: string;
  steps: string[];
  ariaLabel?: string;
  review?: boolean;
};

export const PuzzleAnalysisInstructions = ({
  title,
  steps,
  ariaLabel,
  review = false,
}: PuzzleAnalysisInstructionsProps) => (
  <section
    className={`puzzlePgnInstructions${review ? " puzzleReviewInstructions" : ""}`}
    aria-label={ariaLabel}
  >
    <div>
      <strong>{title}</strong>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
    <a
      className="puzzleAnalysisButton"
      href="https://lichess.org/analysis/atomic"
      target="_blank"
      rel="noreferrer"
    >
      <span>Open analysis board</span>
      <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
    </a>
  </section>
);
