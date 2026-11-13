import "./PracticeMoveButtons.css";

import { faDice, faPause, faPlay, faShuffle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";

type Props = {
  paused: boolean;
  onToggle: () => void;
  onRandom: () => void;
  onDifferent: () => void;
  toggleLabel: string;
  toggleTitle?: string;
  toggleDisabled: boolean;
  randomDisabled: boolean;
  differentDisabled: boolean;
  afterToggle?: ReactNode;
  compact?: boolean;
};

export const PracticeMoveButtons = ({
  paused,
  onToggle,
  onRandom,
  onDifferent,
  toggleLabel,
  toggleTitle,
  toggleDisabled,
  randomDisabled,
  differentDisabled,
  afterToggle,
  compact = false,
}: Props) => (
  <div
    className={`practiceClockActions practiceMoveButtons${compact ? " compact" : ""}`}
    role="group"
    aria-label="Practice controls"
  >
    <button
      type="button"
      onClick={onToggle}
      disabled={toggleDisabled}
      aria-label={toggleLabel}
      title={toggleTitle ?? toggleLabel}
    >
      <FontAwesomeIcon icon={paused ? faPlay : faPause} aria-hidden="true" />
    </button>
    {afterToggle}
    <span className="practiceActionTooltip" data-tooltip="Practice random opponent">
      <button
        type="button"
        className="practiceRandomBoppButton"
        onClick={onRandom}
        disabled={randomDisabled}
        aria-label="Practice a random opponent"
      >
        <FontAwesomeIcon icon={faDice} />
      </button>
    </span>
    <span className="practiceActionTooltip" data-tooltip="Swap opponent’s move">
      <button
        type="button"
        className="practiceAlternateMoveButton"
        onClick={onDifferent}
        disabled={differentDisabled}
        aria-label="Choose a different opponent move"
      >
        <FontAwesomeIcon icon={faShuffle} />
      </button>
    </span>
  </div>
);
