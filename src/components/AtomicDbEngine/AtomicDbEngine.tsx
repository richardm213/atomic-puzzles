import "./AtomicDbEngine.css";

import { faAlignLeft, faArrowsRotate, faGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AtomicDbAnalysisState } from "../../hooks/useAtomicDbAnalysis";
import type { AtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { atomicLegalMoveCount } from "../../lib/chess/pgn";
import { localAnalysisEngineLabel } from "../../lib/practice/localAnalysisEngine";
import {
  atomicDbPositionUrl,
  type AtomicDbView,
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
  threatMode?: boolean;
};

type AtomicDbEngineControlsProps = {
  fen: string;
  analysis: AtomicDbAnalysisState;
  settings: AtomicDbEngineSettings;
  setSettings: Dispatch<SetStateAction<AtomicDbEngineSettings>>;
  onDisable: () => void;
  onFlipBoard?: () => void;
  onThreatModeChange?: (enabled: boolean) => void;
  threatAvailable?: boolean;
  threatMode?: boolean;
  notationInline?: boolean;
  onToggleNotation?: () => void;
};

const analysisSourceLabel = (analysis: AtomicDbAnalysisState, threatMode = false): string => {
  const engine = localAnalysisEngineLabel(analysis.engine ?? "atomic-stockfish");
  const source =
    analysis.source === "terminal"
      ? "Final position"
      : analysis.source === "engine"
        ? engine
        : analysis.source === "mixed"
          ? `AtomicDB + ${engine}`
          : "AtomicDB";
  return threatMode ? `Threat · ${source}` : source;
};

const resultLabel = (view: AtomicDbView): string | null => {
  if (view.position?.outcome === "WHITE_WIN") return "1–0";
  if (view.position?.outcome === "BLACK_WIN") return "0–1";
  if (view.position?.outcome === "DRAW") return "½–½";
  return null;
};

const terminalMessage = (view: AtomicDbView): string | null => {
  if (view.position?.outcome === "WHITE_WIN") return "Game over — White wins.";
  if (view.position?.outcome === "BLACK_WIN") return "Game over — Black wins.";
  if (view.position?.outcome === "DRAW") return "Game over — Draw.";
  return null;
};

const useRetainedAtomicDbView = (analysis: AtomicDbAnalysisState, fen: string): AtomicDbView => {
  const currentView = buildAtomicDbView(analysis.result, fen);
  const settledViewRef = useRef(currentView);

  if (analysis.status !== "loading" || currentView.isCurrent) settledViewRef.current = currentView;
  return analysis.status === "loading" && !currentView.isCurrent
    ? settledViewRef.current
    : currentView;
};

export const AtomicDbEngineControls = ({
  fen,
  analysis,
  settings,
  setSettings,
  onDisable,
  onFlipBoard,
  onThreatModeChange,
  threatAvailable = true,
  threatMode = false,
  notationInline,
  onToggleNotation,
}: AtomicDbEngineControlsProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const visibleLineCount = settings.enabled ? settings.lineCount : 0;
  const view = useRetainedAtomicDbView(analysis, fen);
  const sourceLabel = analysisSourceLabel(analysis, threatMode);
  const finalResult = analysis.source === "terminal" ? resultLabel(view) : null;
  const atomicDbHref =
    !threatMode &&
    analysis.source !== "engine" &&
    analysis.source !== "terminal" &&
    view.isCurrent &&
    view.position?.key
      ? atomicDbPositionUrl(view.position.key)
      : null;

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
    <div className="atomicDbHeaderControls" aria-label="Position analysis controls">
      <button
        type="button"
        className={`atomicDbEngineToggle ${settings.enabled ? "active" : ""}`}
        aria-label="Toggle position analysis"
        aria-pressed={settings.enabled}
        title="Toggle analysis (L)"
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
        {finalResult ?? (view.evaluation.type === "unknown" ? null : view.evaluationLabel)}
      </strong>
      <span className="atomicDbTopSource">
        {atomicDbHref ? (
          <a
            className="atomicDbTopSourceLink"
            href={atomicDbHref}
            target="_blank"
            rel="noreferrer"
            aria-label="Open this position on AtomicDB"
          >
            {sourceLabel}
          </a>
        ) : (
          sourceLabel
        )}
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
            {onThreatModeChange ? (
              <label className="atomicDbFollowUpSetting">
                <span>Threat mode</span>
                <span className="atomicDbSettingShortcut" aria-hidden="true">
                  X
                </span>
                <input
                  type="checkbox"
                  checked={threatMode}
                  disabled={!threatAvailable}
                  title={threatAvailable ? "Show opponent threat" : "Unavailable while in check"}
                  onChange={(event) => onThreatModeChange(event.target.checked)}
                />
              </label>
            ) : null}
            {onToggleNotation ? (
              <button type="button" className="atomicDbSettingsAction" onClick={onToggleNotation}>
                <FontAwesomeIcon icon={faAlignLeft} aria-hidden="true" />
                <span>Move notation</span>
                <span className="atomicDbSettingsActionValue">
                  {notationInline ? "Inline" : "Rows"}
                </span>
              </button>
            ) : null}
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
  threatMode = false,
}: AtomicDbEngineProps) => {
  const { enabled, lineCount, showFollowUpMoves } = settings;
  const { status, error } = analysis;
  const view = useRetainedAtomicDbView(analysis, fen);
  const sourceLabel = analysisSourceLabel(analysis, threatMode);
  const finalMessage = analysis.source === "terminal" ? terminalMessage(view) : null;
  const { position } = view;
  const visibleMoves = useMemo(
    () => position?.moves.slice(0, lineCount) ?? [],
    [lineCount, position],
  );
  const legalMoveCount = useMemo(() => atomicLegalMoveCount(view.fen), [view.fen]);
  const targetLineCount = legalMoveCount > 0 ? Math.min(lineCount, legalMoveCount) : lineCount;
  const missingLineCount = Math.max(0, targetLineCount - visibleMoves.length);
  const showingPreviousPosition = status === "loading" && !view.isCurrent;

  if (!enabled) return null;

  return (
    <section className="atomicDbEngine" aria-label="Position analysis lines">
      <div className="atomicDbEngineBody" aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" && !position ? (
          <div className="atomicDbEngineState">Loading analysis…</div>
        ) : null}
        {status === "error" ? <div className="atomicDbEngineState error">{error}</div> : null}
        {status === "ready" && !position ? (
          <div className="atomicDbEngineState">No {sourceLabel} analysis for this position.</div>
        ) : null}
        {status === "ready" && position && visibleMoves.length === 0 ? (
          <div className="atomicDbEngineState">
            {finalMessage ?? "No engine moves for this position."}
          </div>
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
              const moveEvaluation = getAtomicDbMoveEvaluation(move, view.fen);
              const searchDepth = Math.max(0, Math.floor(move.searchDepth ?? 0));
              const nodeBackedPlies = move.nodeBackedPlies;
              const nodeBackingDepth = nodeBackedPlies === null ? null : `depth ${nodeBackedPlies}`;
              const showNodeBacking = nodeBackingDepth !== null && move.origin !== "engine";
              const showDepth =
                searchDepth > 0 &&
                !showNodeBacking &&
                !(move.origin === "engine" && moveEvaluation.type === "mate");
              const support = [
                showNodeBacking ? `move position backing ${nodeBackingDepth}` : "",
                searchDepth > 0 ? `search depth ${searchDepth}` : "",
              ]
                .filter(Boolean)
                .map((label) => `, ${label}`)
                .join("");
              const depthTitle = [
                showNodeBacking ? `AtomicDB move position backing ${nodeBackingDepth}` : "",
                searchDepth > 0 ? `Search depth ${searchDepth}` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              const depthLabel = showNodeBacking
                ? nodeBackingDepth
                : showDepth
                  ? `depth ${searchDepth}`
                  : "";
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
                  <span className="atomicDbEngineDepth" title={depthTitle || undefined}>
                    {depthLabel}
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
  threatMode = false,
}: {
  fen: string;
  analysis: AtomicDbAnalysisState;
  enabled: boolean;
  orientation: "white" | "black";
  threatMode?: boolean;
}) => {
  const { status } = analysis;
  const view = useRetainedAtomicDbView(analysis, fen);
  const sourceLabel = analysisSourceLabel(analysis, threatMode);
  const displayedEvaluation =
    (analysis.source === "terminal" ? resultLabel(view) : null) ?? view.evaluationLabel;

  return (
    <div
      className={`atomicDbEvalBar ${enabled ? "expanded" : "collapsed"} ${
        orientation === "black" ? "flipped" : ""
      } ${status === "loading" ? "loading" : ""}`}
      role={enabled ? "meter" : undefined}
      aria-hidden={!enabled}
      aria-label={
        enabled
          ? `${sourceLabel} evaluation ${status === "loading" ? "loading" : displayedEvaluation}`
          : undefined
      }
      aria-valuemin={enabled ? 0 : undefined}
      aria-valuemax={enabled ? 100 : undefined}
      aria-valuenow={enabled ? view.whitePercent : undefined}
      title={
        enabled
          ? status === "loading"
            ? `Loading ${sourceLabel} evaluation`
            : `${sourceLabel}: ${displayedEvaluation}`
          : undefined
      }
    >
      <span className="atomicDbEvalWhite" style={{ height: `${view.whitePercent}%` }} />
    </div>
  );
};
