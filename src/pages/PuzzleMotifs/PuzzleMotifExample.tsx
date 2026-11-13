import "./PuzzleMotifs.css";

import {
  faBackwardStep,
  faChevronLeft,
  faChevronRight,
  faForwardStep,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { buildPgnHistory } from "../../components/Chessboard/pgnHistory";
import type { SolutionNavigation } from "../../types/chessboard";
import type { MotifExample } from "./motifExamples";

export type ReplayFocusRequest = { tag?: string; pointer: boolean };

type ReplayProps = {
  example: MotifExample;
  name: string;
  focusRequest: ReplayFocusRequest | null;
  startAtEnd?: boolean;
};

const focusReplay = (element: HTMLDivElement, pointer: boolean) => {
  element.toggleAttribute("data-pointer-focus", pointer);
  element.focus({ preventScroll: true });
};

const Replay = ({ example, name, focusRequest, startAtEnd = false }: ReplayProps) => {
  const replayRef = useRef<HTMLDivElement>(null);
  const { fen, pgn, note } = example;
  const history = useMemo(() => buildPgnHistory(fen, pgn), [fen, pgn]);
  const [ply, setPly] = useState(() =>
    startAtEnd && history.ok ? history.history.plies.length - 1 : 0,
  );
  const navigation = useMemo<SolutionNavigation>(() => ({ type: "solution", line: 0, ply }), [ply]);
  useLayoutEffect(() => {
    if (!focusRequest || !replayRef.current) return;
    if (focusRequest.tag) {
      document.getElementById(focusRequest.tag)?.scrollIntoView({ block: "start" });
    } else {
      replayRef.current.scrollIntoView({ block: "nearest" });
    }
    focusReplay(replayRef.current, focusRequest.pointer);
  }, [focusRequest]);
  if (!history.ok || history.history.plies.length < 2) return null;
  const { plies } = history.history;
  const lastPly = plies.length - 1;
  const fields = fen.split(" ");
  const orientation = fields[1] === "b" ? "black" : "white";
  const firstPly = (Math.max(1, Number(fields[5]) || 1) - 1) * 2 + Number(orientation === "black");
  const controls = [
    { icon: faBackwardStep, name: "Starting position", target: 0 },
    { icon: faChevronLeft, name: "Previous move", target: Math.max(0, ply - 1) },
    { icon: faChevronRight, name: "Next move", target: Math.min(lastPly, ply + 1) },
    { icon: faForwardStep, name: "Final position", target: lastPly },
  ];
  const handleArrowKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setPly((current) => Math.min(lastPly, Math.max(0, current + step)));
  };

  return (
    <figure data-board-resize="motif" className="motifExample" aria-label={`${name} example`}>
      {/* The replay group can take focus itself or receive arrow keys from its controls. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={replayRef}
        className="motifReplay"
        role="group"
        aria-label={`${name} replay`}
        aria-keyshortcuts="ArrowLeft ArrowRight"
        tabIndex={-1}
        onClickCapture={(event) => {
          if (event.detail === 0) return;
          const button = event.target instanceof Element ? event.target.closest("button") : null;
          if (button) button.focus({ preventScroll: true });
          else focusReplay(event.currentTarget, true);
        }}
        onBlur={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.removeAttribute("data-pointer-focus");
          }
        }}
        onKeyDown={handleArrowKey}
      >
        <div
          className="motifReplayBoard"
          role="group"
          aria-label={`Atomic chess board, ${orientation} at the bottom`}
        >
          <Chessboard
            puzzleId={null}
            fen={fen}
            orientation={orientation}
            coordinates
            solution={pgn}
            showSolution
            enableNavigationShortcuts={false}
            solutionNavigation={navigation}
          />
        </div>

        <div className="motifReplayPanel">
          <span className="visuallyHidden" role="status">
            {ply ? `${plies[ply]?.san}, move ${ply} of ${lastPly}` : "Starting position"}
          </span>
          <ol className="motifReplayMoves" aria-label="Solution moves">
            {plies.slice(1).map((position, index) => {
              const absolutePly = firstPly + index;
              const number = Math.floor(absolutePly / 2) + 1;
              const prefix = `${number}${absolutePly % 2 === 0 ? "." : "…"}`;
              return (
                <li key={index}>
                  <button
                    type="button"
                    aria-current={ply === index + 1 ? "step" : undefined}
                    onClick={() => setPly(index + 1)}
                  >
                    <span>{prefix}</span> {position.san}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="motifReplayControls" role="group" aria-label="Example playback">
            {controls.map(({ icon, name: label, target }) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                aria-disabled={target === ply}
                onClick={() => setPly(target)}
              >
                <FontAwesomeIcon icon={icon} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {note ? <figcaption>{note}</figcaption> : null}
    </figure>
  );
};

export const PuzzleMotifExample = (props: ReplayProps) => {
  const [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setReady(true);
      return;
    }

    // Create each board only once it is near the reader.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container}>
      {ready || props.focusRequest ? (
        <Replay {...props} />
      ) : (
        <div className="motifExamplePlaceholder" aria-hidden="true" />
      )}
    </div>
  );
};
