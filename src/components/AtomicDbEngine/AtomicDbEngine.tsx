import "./AtomicDbEngine.css";

import { faAlignLeft, faArrowsRotate, faGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";

import { useKeyboardShortcutSettings } from "../../context/AppSettings";
import type { AtomicDbAnalysisState } from "../../hooks/useAtomicDbAnalysis";
import type { AtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { useBoardActionShortcuts } from "../../hooks/useBoardActionShortcuts";
import {
  keyboardShortcutAria,
  keyboardShortcutHint,
} from "../../lib/keyboardShortcuts";
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
  beforeSettings?: ReactNode;
  additionalSettings?: ReactNode;
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

const analysisSourceLabel = (
  analysis: AtomicDbAnalysisState,
  view: AtomicDbView,
  threatMode: boolean,
  lineCount?: number,
): string => {
  const engine = localAnalysisEngineLabel(analysis.engine ?? "atomic-stockfish");
  let source = "AtomicDB";
  if (analysis.source === "terminal") {
    source = "Game over";
  } else if (analysis.source === "engine") {
    source = engine;
  } else if (analysis.source === "mixed" && lineCount !== undefined) {
    const evaluations = (view.position?.moves ?? [])
      .slice(0, lineCount)
      .filter((move) => getAtomicDbMoveEvaluation(move, view.fen).type !== "unknown");
    const engineCount = evaluations.filter((move) => move.origin === "engine").length;
    // Extending an AtomicDB variation doesn't change where its evaluation came from.
    if (!evaluations.length || engineCount * 3 > evaluations.length) {
      source = `AtomicDB + ${engine}`;
    }
  } else if (analysis.source === "mixed") {
    // The meter describes the position score, not the sources of its candidate lines.
    const best = view.position?.moves.find((move) => move.uci === view.position?.bestMove);
    if (best?.origin === "engine" && best.mate !== null) source = engine;
  }
  return threatMode ? `Threat · ${source}` : source;
};

const resultLabel = (view: AtomicDbView): string | null => {
  if (view.position?.outcome === "WHITE_WIN") return "1–0";
  if (view.position?.outcome === "BLACK_WIN") return "0–1";
  if (view.position?.outcome === "DRAW") return "½–½";
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
  beforeSettings,
  additionalSettings,
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
  const keyboardShortcuts = useKeyboardShortcutSettings();
  const engineShortcutHint = keyboardShortcutHint(keyboardShortcuts, "toggleEngine");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const view = useRetainedAtomicDbView(analysis, fen);
  const sourceLabel = analysisSourceLabel(analysis, view, threatMode, settings.lineCount);
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
    const clampedCount = Math.min(5, Math.max(1, nextLineCount));
    setSettings((current) => ({ ...current, lineCount: clampedCount }));
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

  useBoardActionShortcuts({
    toggleEngine: () => {
      setSettings((current) => ({ ...current, enabled: !current.enabled }));
      onDisable();
    },
    toggleFollowUps: () =>
      setSettings((current) => ({ ...current, showFollowUpMoves: !current.showFollowUpMoves })),
    ...(onFlipBoard ? { flipBoard: onFlipBoard } : {}),
    ...(onThreatModeChange
      ? {
          toggleThreat: () => {
            if (!settings.enabled || !threatAvailable) return false;
            onThreatModeChange(!threatMode);
          },
        }
      : {}),
  });

  return (
    <div className="atomicDbHeaderControls" aria-label="Position analysis controls">
      <button
        type="button"
        className={`atomicDbEngineToggle ${settings.enabled ? "active" : ""}`}
        aria-label="Toggle position analysis"
        aria-keyshortcuts={keyboardShortcutAria(keyboardShortcuts, "toggleEngine")}
        aria-pressed={settings.enabled}
        title={`Toggle analysis${engineShortcutHint ? ` (${engineShortcutHint})` : ""}`}
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
      {beforeSettings ? <div className="atomicDbBeforeSettings">{beforeSettings}</div> : null}
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
            <label className="atomicDbSourceSetting">
              <span>Use AtomicDB</span>
              <input
                type="checkbox"
                checked={settings.atomicDbEnabled !== false}
                onChange={(event) => {
                  const atomicDbEnabled = event.target.checked;
                  setSettings((current) => ({ ...current, atomicDbEnabled }));
                }}
              />
            </label>
            <label className="atomicDbLinesSetting">
              <span>Multiple lines</span>
              <output>{settings.lineCount}</output>
              <input
                type="range"
                aria-label="Multiple lines"
                min="1"
                max="5"
                step="1"
                value={settings.lineCount}
                onChange={(event) => setLineCount(Number(event.target.value))}
              />
            </label>
            <label className="atomicDbFollowUpSetting">
              <span>Follow-up moves</span>
              <span className="atomicDbSettingShortcut" aria-hidden="true">
                {keyboardShortcutHint(keyboardShortcuts, "toggleFollowUps")}
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
                  {keyboardShortcutHint(keyboardShortcuts, "toggleThreat")}
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
            {additionalSettings}
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
  const sourceLabel = analysisSourceLabel(analysis, view, threatMode, settings.lineCount);
  const isTerminal = analysis.source === "terminal";
  const { position } = view;
  const visibleMoves =
    isTerminal || status === "error" ? [] : (position?.moves.slice(0, lineCount) ?? []);
  let stateMessage = "";
  if (!isTerminal) {
    if (status === "error") stateMessage = error;
    else if (status === "loading" && !position) stateMessage = "Loading analysis…";
    else if (status === "ready" && !position) {
      stateMessage = `No ${sourceLabel} analysis for this position.`;
    } else if (status === "ready" && visibleMoves.length === 0) {
      stateMessage = "No engine moves for this position.";
    }
  }
  const showingPreviousPosition = status === "loading" && !view.isCurrent;
  const previewSourceKey = `${view.fen}:${visibleMoves.map((move) => move.uci).join(",")}`;

  useEffect(
    () => () => {
      onHoverMove(null);
    },
    [onHoverMove, previewSourceKey],
  );

  if (!enabled) return null;

  return (
    <section
      className="atomicDbEngine"
      aria-label="Position analysis lines"
      onPointerLeave={() => onHoverMove(null)}
    >
      <div className="atomicDbEngineBody" aria-live="polite" aria-busy={status === "loading"}>
        <ol
          className="atomicDbEngineLines"
          aria-hidden={visibleMoves.length === 0 && !stateMessage ? true : undefined}
        >
          {Array.from({ length: lineCount }, (_, index) => {
            const move = visibleMoves[index];
            if (!move) {
              const message = index === 0 ? stateMessage : "";
              return (
                <li
                  key={`empty-${index}`}
                  className="atomicDbEngineLine"
                  aria-hidden={!message || undefined}
                >
                  {message ? (
                    <span
                      className={`atomicDbEngineState ${status === "error" ? "error" : ""}`}
                      title={message}
                    >
                      {message}
                    </span>
                  ) : null}
                </li>
              );
            }
            const principalVariation = analysis.principalVariations[move.uci];
            const displayedUcis = showFollowUpMoves
              ? (principalVariation ?? [move.uci])
              : [move.uci];
            const lineTokens = numberedSanLineFromUci(view.fen, displayedUcis);
            if (lineTokens.length === 0) {
              return (
                <li
                  key={move.uci}
                  className="atomicDbEngineLine"
                  aria-label="Updating move notation"
                >
                  <span className="atomicDbEngineState">Updating…</span>
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
        </ol>
      </div>
    </section>
  );
};

export const AtomicDbEvalBar = ({
  fen,
  analysis,
  enabled,
  neutral = false,
  orientation,
  threatMode = false,
}: {
  fen: string;
  analysis: AtomicDbAnalysisState;
  enabled: boolean;
  neutral?: boolean;
  orientation: "white" | "black";
  threatMode?: boolean;
}) => {
  const { status } = analysis;
  const view = useRetainedAtomicDbView(analysis, fen);
  const displayedStatus = neutral ? "ready" : status;
  const sourceLabel = neutral
    ? "Wolfrandom opening"
    : analysisSourceLabel(analysis, view, threatMode);
  const displayedEvaluation = neutral
    ? "0.0"
    : ((analysis.source === "terminal" ? resultLabel(view) : null) ?? view.evaluationLabel);
  const whitePercent = neutral ? 50 : view.whitePercent;

  return (
    <div
      className={`atomicDbEvalBar ${enabled ? "expanded" : "collapsed"} ${
        orientation === "black" ? "flipped" : ""
      } ${displayedStatus === "loading" ? "loading" : ""}`}
      role={enabled ? "meter" : undefined}
      aria-hidden={!enabled}
      aria-label={
        enabled
          ? `${sourceLabel} evaluation ${displayedStatus === "loading" ? "loading" : displayedEvaluation}`
          : undefined
      }
      aria-valuemin={enabled ? 0 : undefined}
      aria-valuemax={enabled ? 100 : undefined}
      aria-valuenow={enabled ? whitePercent : undefined}
      title={
        enabled
          ? displayedStatus === "loading"
            ? `Loading ${sourceLabel} evaluation`
            : `${sourceLabel}: ${displayedEvaluation}`
          : undefined
      }
    >
      <span className="atomicDbEvalWhite" style={{ height: `${whitePercent}%` }} />
    </div>
  );
};
