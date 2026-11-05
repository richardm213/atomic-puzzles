import "./SolutionMoveNavigation.css";

import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef } from "react";

import { movePrefix } from "../../lib/chess/pgn";
import type { PlaybackCommand } from "../../types/chessboard";
import { PlaybackButtons } from "../PlaybackButtons/PlaybackButtons";
import {
  matchingLineIndexes,
  type VariationOption,
  variationOptions,
  VariationTree,
} from "../VariationTree/VariationTree";

export const continuationOptionsAt = (
  lines: string[][],
  currentMoves: string[],
): VariationOption[] =>
  variationOptions(lines, currentMoves.length, matchingLineIndexes(lines, currentMoves));

export const SolutionPlaybackControls = ({
  canStart,
  canPrevious,
  canNext,
  canEnd,
  onNavigate,
}: {
  canStart: boolean;
  canPrevious: boolean;
  canNext: boolean;
  canEnd: boolean;
  onNavigate: (command: Extract<PlaybackCommand, "start" | "previous" | "next" | "end">) => void;
}) => (
  <div className="solutionPlaybackControls" aria-label="Line playback">
    <PlaybackButtons
      buttonClassName="solutionPlaybackButton"
      canStart={canStart}
      canPrevious={canPrevious}
      canNext={canNext}
      canEnd={canEnd}
      onNavigate={onNavigate}
      labels={{
        start: "Go to start of line",
        previous: "Go to previous move",
        next: "Go to next move",
        end: "Go to end of line",
      }}
      titles={{
        start: "Start (Arrow Up)",
        previous: "Previous (Arrow Left)",
        next: "Next (Arrow Right)",
        end: "End (Arrow Down)",
      }}
    />
  </div>
);

export const SolutionContinuationOptions = ({
  options,
  currentPly,
  activeLineIndex,
  onSelect,
  onCycle,
}: {
  options: VariationOption[];
  currentPly: number;
  activeLineIndex: number;
  onSelect: (lineIndex: number, moveIndex: number) => void;
  onCycle?: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
}) => {
  const activeMove =
    options.find((option) => option.lineIndex === activeLineIndex)?.move ?? options[0]?.move;
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const activeOption = activeOptionRef.current;
    if (typeof activeOption?.scrollIntoView === "function") {
      activeOption.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeMove]);

  if (options.length < 2) return null;

  return (
    <div className="solutionOptions">
      <div className="solutionOptionsHeader">
        <span className="solutionOptionsLabel">{options.length} options from here</span>
        {onCycle ? (
          <div className="solutionOptionNavigation" aria-label="Choose continuation">
            <button
              type="button"
              aria-label="Previous continuation"
              title="Previous continuation (Arrow Up)"
              onClick={() => onCycle("previousOption")}
            >
              <FontAwesomeIcon icon={faChevronUp} />
            </button>
            <button
              type="button"
              aria-label="Next continuation"
              title="Next continuation (Arrow Down)"
              onClick={() => onCycle("nextOption")}
            >
              <FontAwesomeIcon icon={faChevronDown} />
            </button>
          </div>
        ) : (
          <span className="solutionOptionsHint">↑/↓ to choose</span>
        )}
      </div>
      <div className="solutionOptionList" role="list" aria-label="Solution options">
        {options.map((option) => (
          <button
            key={`${option.lineIndex}-${option.plyIndex}-${option.move}`}
            type="button"
            className={`solutionOption ${option.move === activeMove ? "active" : ""}`}
            ref={option.move === activeMove ? activeOptionRef : null}
            aria-current={option.move === activeMove ? "true" : undefined}
            onClick={() => onSelect(option.lineIndex, option.plyIndex)}
          >
            {movePrefix(currentPly, currentPly % 2 === 1)}
            {option.move}
          </button>
        ))}
      </div>
    </div>
  );
};

export const SolutionMoveTree = ({
  lines,
  options,
  currentPly,
  activeLineIndex,
  onSelect,
  onCycleOptions,
}: {
  lines: string[][];
  options: VariationOption[];
  currentPly: number;
  activeLineIndex: number;
  onSelect: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions?: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
}) => (
  <>
    <SolutionContinuationOptions
      options={options}
      currentPly={currentPly}
      activeLineIndex={activeLineIndex}
      onSelect={onSelect}
      {...(onCycleOptions ? { onCycle: onCycleOptions } : {})}
    />
    {lines.length ? (
      <div className="moveList inlineSolutionTree" role="list" aria-label="Solution variations">
        <VariationTree
          lines={lines}
          activeLine={Math.min(activeLineIndex, lines.length - 1)}
          currentPly={currentPly}
          onMoveClick={onSelect}
        />
      </div>
    ) : null}
  </>
);
