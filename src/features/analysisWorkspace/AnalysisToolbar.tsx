import { faAlignLeft, faBookOpen } from "@fortawesome/free-solid-svg-icons";
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
  notationInline?: boolean;
  onToggleNotation?: () => void;
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
  notationInline,
  onToggleNotation,
  onToggle,
  toggleAriaLabel,
  toggleClassName,
  toggleTitle,
}: AnalysisToolbarProps) => {
  const toolbarClasses = [
    "analysisBottomToolbar",
    onToggleNotation ? "hasNotationToggle" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");
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
      {onToggleNotation ? (
        <button
          type="button"
          className="analysisToolbarButton notation"
          aria-label={notationInline ? "Use non-inline notation" : "Use inline notation"}
          aria-pressed={notationInline}
          title={notationInline ? "Use non-inline notation" : "Use inline notation"}
          onClick={onToggleNotation}
        >
          <FontAwesomeIcon icon={faAlignLeft} aria-hidden="true" />
        </button>
      ) : null}
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
