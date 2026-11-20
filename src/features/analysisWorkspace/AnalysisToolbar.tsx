import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";

import { PlaybackButtons } from "../../components/PlaybackButtons/PlaybackButtons";
import type { PlaybackCommand } from "../../types/chessboard";

type PlaybackBarProps = {
  ariaLabel: string;
  canStepBack: boolean;
  canStepForward: boolean;
  className?: string;
  onNavigate: (command: PlaybackCommand) => void;
};

export const AnalysisPlaybackBar = ({
  ariaLabel,
  canStepBack,
  canStepForward,
  className,
  onNavigate,
  leading,
}: PlaybackBarProps & { leading?: ReactNode }) => (
  <div
    className={["analysisBottomToolbar", !leading && "playbackOnly", className]
      .filter(Boolean)
      .join(" ")}
    aria-label={ariaLabel}
  >
    {leading}
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

type AnalysisToolbarProps = PlaybackBarProps & {
  active: boolean;
  onToggle: () => void;
  toggleAriaLabel: string;
  toggleClassName?: string;
  toggleDisabled?: boolean;
  toggleTitle: string;
};

export const AnalysisToolbar = ({
  active,
  onToggle,
  toggleAriaLabel,
  toggleClassName,
  toggleDisabled,
  toggleTitle,
  ...playback
}: AnalysisToolbarProps) => {
  const toggleClasses = ["analysisToolbarButton", toggleClassName, active ? "active" : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <AnalysisPlaybackBar
      {...playback}
      leading={
        <button
          type="button"
          className={toggleClasses}
          aria-label={toggleAriaLabel}
          aria-pressed={active}
          disabled={toggleDisabled}
          title={toggleTitle}
          onClick={onToggle}
        >
          <FontAwesomeIcon icon={faBookOpen} aria-hidden="true" />
        </button>
      }
    />
  );
};
