import {
  faBackward,
  faBackwardStep,
  faForward,
  faForwardStep,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { SolutionNavigation } from "../../types/chessboard";

type PlaybackCommand = NonNullable<SolutionNavigation["command"]>;

const BUTTONS: Array<{
  command: PlaybackCommand;
  icon: typeof faBackward;
  label: string;
  title: string;
}> = [
  { command: "start", icon: faBackwardStep, label: "Go to start", title: "Go to start" },
  { command: "previous", icon: faBackward, label: "Previous move", title: "Previous move" },
  { command: "next", icon: faForward, label: "Next move", title: "Next move" },
  { command: "end", icon: faForwardStep, label: "Go to latest move", title: "Go to latest move" },
];

export const PlaybackButtons = ({
  buttonClassName,
  canStart,
  canPrevious,
  canNext,
  canEnd,
  onNavigate,
  labels,
  titles,
}: {
  buttonClassName: string;
  canStart: boolean;
  canPrevious: boolean;
  canNext: boolean;
  canEnd: boolean;
  onNavigate: (command: PlaybackCommand) => void;
  labels?: Partial<Record<PlaybackCommand, string>>;
  titles?: Partial<Record<PlaybackCommand, string>>;
}) => {
  const enabled: Record<PlaybackCommand, boolean> = {
    start: canStart,
    previous: canPrevious,
    next: canNext,
    end: canEnd,
  };

  return BUTTONS.map((button) => (
    <button
      key={button.command}
      type="button"
      className={buttonClassName}
      aria-label={labels?.[button.command] ?? button.label}
      title={titles?.[button.command] ?? button.title}
      disabled={!enabled[button.command]}
      onClick={() => onNavigate(button.command)}
    >
      <FontAwesomeIcon icon={button.icon} />
    </button>
  ));
};
