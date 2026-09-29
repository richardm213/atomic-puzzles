import "./AtomicDbEngine.css";

import { faArrowsRotate, faGear, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AtomicDbAnalysisState } from "../../hooks/useAtomicDbAnalysis";
import type { AtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import {
  buildAtomicDbView,
  formatAtomicDbEvaluation,
  getAtomicDbMoveEvaluation,
} from "../../utils/atomicDb";
import { numberedSanLineFromUci } from "../../utils/chessNotation";

type AtomicDbEngineProps = {
  fen: string;
  settings: AtomicDbEngineSettings;
  analysis: AtomicDbAnalysisState;
  onPlayLine: (ucis: string[]) => void;
  onHoverMove: (uci: string | null) => void;
  disabled?: boolean;
};

type AtomicDbEngineControlsProps = {
  fen: string;
  analysis: AtomicDbAnalysisState;
  settings: AtomicDbEngineSettings;
  setSettings: Dispatch<SetStateAction<AtomicDbEngineSettings>>;
  onDisable: () => void;
  onFlipBoard?: () => void;
};

export const AtomicDbEngineControls = ({
  fen,
  analysis,
  settings,
  setSettings,
  onDisable,
  onFlipBoard,
}: AtomicDbEngineControlsProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const visibleLineCount = settings.enabled ? settings.lineCount : 0;
  const view = buildAtomicDbView(analysis.result, fen);

  const setLineCount = (nextLineCount: number): void => {
    const clampedCount = Math.min(5, Math.max(0, nextLineCount));
    if (clampedCount === 0) {
      setSettings((current) => ({ ...current, enabled: false }));
      onDisable();
      return;
    }
    setSettings((current) => ({ ...current, enabled: true, lineCount: clampedCount }));
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (event.target instanceof Node && settingsRef.current?.contains(event.target)) return;
      setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  return (
    <div className="atomicDbHeaderControls" aria-label="AtomicDB analysis controls">
      <button
        type="button"
        className={`atomicDbEngineToggle ${settings.enabled ? "active" : ""}`}
        aria-label="Toggle AtomicDB analysis"
        aria-pressed={settings.enabled}
        title="Toggle AtomicDB analysis (L)"
        onClick={() => {
          setSettings((current) => ({ ...current, enabled: !current.enabled }));
          onDisable();
        }}
      >
        <span className="atomicDbToggleTrack" aria-hidden="true">
          <span />
        </span>
      </button>
      <strong className="atomicDbTopEvaluation" aria-live="polite">
        {view.evaluation.type === "unknown" ? null : view.evaluationLabel}
      </strong>
      <span className="atomicDbTopSource">
        AtomicDB
        {analysis.status === "loading" && settings.enabled ? (
          <FontAwesomeIcon icon={faSpinner} spin aria-label="Loading new AtomicDB evaluation" />
        ) : null}
      </span>
      <div className="atomicDbSettings" ref={settingsRef}>
        <button
          type="button"
          className="atomicDbSettingsButton"
          aria-label="Engine settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          title="Engine settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <FontAwesomeIcon icon={faGear} aria-hidden="true" />
        </button>
        {settingsOpen ? (
          <div className="atomicDbSettingsMenu" role="dialog" aria-label="Engine settings">
            <label className="atomicDbLinesSetting">
              <span>Multiple lines</span>
              <output>{visibleLineCount}</output>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={visibleLineCount}
                onChange={(event) => setLineCount(Number(event.target.value))}
              />
            </label>
            <label className="atomicDbFollowUpSetting">
              <span>Follow-up moves</span>
              <span className="atomicDbSettingShortcut" aria-hidden="true">
                K
              </span>
              <input
                type="checkbox"
                checked={settings.showFollowUpMoves}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    showFollowUpMoves: event.target.checked,
                  }))
                }
              />
            </label>
            {onFlipBoard ? (
              <button
                type="button"
                className="atomicDbSettingsAction"
                onClick={() => {
                  onFlipBoard();
                  setSettingsOpen(false);
                }}
              >
                <FontAwesomeIcon icon={faArrowsRotate} aria-hidden="true" />
                <span>Flip board</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const AtomicDbEngine = ({
  fen,
  settings,
  analysis,
  onPlayLine,
  onHoverMove,
  disabled = false,
}: AtomicDbEngineProps) => {
  const { enabled, lineCount, showFollowUpMoves } = settings;
  const { status, error } = analysis;
  const view = buildAtomicDbView(analysis.result, fen);
  const { position } = view;
  const visibleMoves = useMemo(
    () => position?.moves.slice(0, lineCount) ?? [],
    [lineCount, position],
  );
  const missingLineCount = Math.max(0, lineCount - visibleMoves.length);
  const showingPreviousPosition = status === "loading" && !view.isCurrent;

  if (!enabled) return null;

  return (
    <section className="atomicDbEngine" aria-label="AtomicDB engine lines">
      <div className="atomicDbEngineBody" aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" && !position ? (
          <div className="atomicDbEngineState">
            <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
            <span>Loading analysis…</span>
          </div>
        ) : null}
        {status === "error" ? <div className="atomicDbEngineState error">{error}</div> : null}
        {status === "ready" && !position ? (
          <div className="atomicDbEngineState">No AtomicDB analysis for this position.</div>
        ) : null}
        {status === "ready" && position && visibleMoves.length === 0 ? (
          <div className="atomicDbEngineState">No analyzed moves for this position.</div>
        ) : null}
        {visibleMoves.length > 0 ? (
          <ol className="atomicDbEngineLines">
            {visibleMoves.map((move) => {
              const principalVariation = analysis.principalVariations[move.uci];
              const displayedUcis = showFollowUpMoves
                ? (principalVariation ?? [move.uci])
                : [move.uci];
              const lineTokens = numberedSanLineFromUci(view.fen, displayedUcis);
              if (lineTokens.length === 0) {
                return (
                  <li
                    key={move.uci}
                    className="atomicDbEngineLineUnavailable"
                    aria-label="Updating move notation"
                  >
                    <span>—</span>
                    <span>Updating…</span>
                    <span />
                  </li>
                );
              }
              const support = move.backedPlies > 0 ? `, backed to depth ${move.backedPlies}` : "";
              const moveEvaluation = getAtomicDbMoveEvaluation(move, view.fen);
              const evaluation = formatAtomicDbEvaluation(moveEvaluation);
              const displayedLine = lineTokens.map((token) => token.value).join(" ");
              return (
                <li
                  key={move.uci}
                  className="atomicDbEngineLine"
                  aria-label={`Evaluation ${evaluation}${support}, line ${displayedLine}`}
                >
                  <span
                    className={`atomicDbEngineScore ${moveEvaluation.type === "mate" ? "mate" : ""}`}
                  >
                    {evaluation}
                  </span>
                  <span className="atomicDbEngineMove">
                    {lineTokens.map((token, index) =>
                      token.type === "moveNumber" ? (
                        <span className="atomicDbEngineMoveNumber" key={`number-${index}`}>
                          {token.value}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={`atomicDbEngineMoveButton ${token.ply === 0 ? "first" : ""}`}
                          disabled={showingPreviousPosition || disabled}
                          aria-label={`Play variation through ${token.value}`}
                          key={`move-${token.ply}`}
                          onPointerEnter={() =>
                            onHoverMove(token.ply === 0 ? (displayedUcis[0] ?? null) : null)
                          }
                          onPointerLeave={() => onHoverMove(null)}
                          onFocus={() =>
                            onHoverMove(token.ply === 0 ? (displayedUcis[0] ?? null) : null)
                          }
                          onBlur={() => onHoverMove(null)}
                          onClick={() => onPlayLine(displayedUcis.slice(0, token.ply + 1))}
                        >
                          {token.value}
                        </button>
                      ),
                    )}
                  </span>
                  <span
                    className="atomicDbEngineDepth"
                    title={move.backedPlies > 0 ? `Backed to depth ${move.backedPlies}` : undefined}
                  >
                    {move.backedPlies > 0 ? `depth ${move.backedPlies}` : ""}
                  </span>
                </li>
              );
            })}
            {position
              ? Array.from({ length: missingLineCount }, (_, index) => (
                  <li
                    key={`unavailable-${index}`}
                    className="atomicDbEngineLineUnavailable"
                    aria-label="No additional analyzed move available"
                  >
                    <span>—</span>
                    <span>No analyzed line</span>
                    <span />
                  </li>
                ))
              : null}
          </ol>
        ) : null}
      </div>
    </section>
  );
};

export const AtomicDbEvalBar = ({
  fen,
  analysis,
  enabled,
  orientation,
}: {
  fen: string;
  analysis: AtomicDbAnalysisState;
  enabled: boolean;
  orientation: "white" | "black";
}) => {
  const { status } = analysis;
  const view = buildAtomicDbView(analysis.result, fen);

  return (
    <div
      className={`atomicDbEvalBar ${enabled ? "expanded" : "collapsed"} ${
        orientation === "black" ? "flipped" : ""
      } ${status === "loading" ? "loading" : ""}`}
      role={enabled ? "meter" : undefined}
      aria-hidden={!enabled}
      aria-label={
        enabled
          ? `AtomicDB evaluation ${status === "loading" ? "loading" : view.evaluationLabel}`
          : undefined
      }
      aria-valuemin={enabled ? 0 : undefined}
      aria-valuemax={enabled ? 100 : undefined}
      aria-valuenow={enabled ? view.whitePercent : undefined}
      title={
        enabled
          ? status === "loading"
            ? "Loading AtomicDB evaluation"
            : `AtomicDB: ${view.evaluationLabel}`
          : undefined
      }
    >
      <span className="atomicDbEvalWhite" style={{ height: `${view.whitePercent}%` }} />
    </div>
  );
};
