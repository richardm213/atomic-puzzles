import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { PlaybackButtons } from "../../components/PlaybackButtons/PlaybackButtons";
import type { PlaybackCommand } from "../../types/chessboard";

type AnalysisToolbarProps = {
  active: boolean;
  ariaLabel: string;
  canStepBack: boolean;
  canStepForward: boolean;
  className?: string;
  onNavigate: (command: PlaybackCommand) => void;
  onToggle: () => void;
  toggleAriaLabel: string;
  toggleClassName?: string;
  toggleTitle: string;
};

export const AnalysisToolbar = ({
  active,
  ariaLabel,
  canStepBack,
  canStepForward,
  className,
  onNavigate,
  onToggle,
  toggleAriaLabel,
  toggleClassName,
  toggleTitle,
}: AnalysisToolbarProps) => {
  const toolbarClasses = ["analysisBottomToolbar", className].filter(Boolean).join(" ");
  const toggleClasses = ["analysisToolbarButton", toggleClassName, active ? "active" : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={toolbarClasses} aria-label={ariaLabel}>
      <button
        type="button"
        className={toggleClasses}
        aria-label={toggleAriaLabel}
        aria-pressed={active}
        title={toggleTitle}
        onClick={onToggle}
      >
        <FontAwesomeIcon icon={faBookOpen} aria-hidden="true" />
      </button>
      <PlaybackButtons
        buttonClassName="analysisToolbarButton"
        canStart={canStepBack}
        canPrevious={canStepBack}
        canNext={canStepForward}
        canEnd={canStepForward}
        onNavigate={onNavigate}
      />
    </div>
  );
};
