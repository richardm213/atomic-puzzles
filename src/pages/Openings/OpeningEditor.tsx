import "../../features/analysisWorkspace/AnalysisWorkspace.css";

import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import {
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import {
  addOpeningLine,
  dueOpeningCards,
  importOpeningPgn,
  type LineKind,
  markOpeningBranch,
  type OpeningCard,
  openingCards,
  type OpeningDocument,
  openingLineKinds,
  openingLineSans,
  openingLineUcis,
  openingPgn,
  openingPrefixPgn,
  openingReviewDue,
  type Traversal,
  validateOpeningDocument,
  visibleOpeningLines,
} from "../../../shared/domain/openings/repertoire";
import { AnalysisContinuationChoices } from "../../components/AnalysisMoveTree/AnalysisMoveTree";
import { useBoardDocument } from "../../hooks/useBoardDocument";
import { usePersistedState } from "../../hooks/usePersistedState";
import { buildBoardLoadNavigation } from "../../lib/analysis/boardLoading";
import { getBoardMoveState } from "../../lib/analysis/boardState";
import { startingPlyFromFen } from "../../lib/chess/pgn";
import { changeOpening, type OpeningCopy } from "../../lib/openings/api";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { getErrorMessage } from "../../utils/errors";
import { AnalysisPage } from "../Analysis/Analysis";
import { PracticeEngineSettings } from "../Practice/PracticeEngineSettings";
import { usePracticeSettings } from "../Practice/usePracticeSettings";
import { OpeningTree } from "./OpeningTree";

const lineKinds = [
  { kind: "essential", label: "Essential" },
  { kind: "tertiary", label: "Tertiary" },
  { kind: "mate", label: "Mating" },
] as const;

const quizQueue = (
  doc: OpeningDocument,
  progress: OpeningCopy["progress"],
  kind: LineKind,
  traversal: Traversal,
  early: boolean,
  covered: Set<string>,
  now = Date.now(),
): OpeningCard[] => {
  if (kind === "essential" && !early) return dueOpeningCards(doc, progress, now, traversal);
  return openingCards(doc, kind)
    .filter((c) => !covered.has(c.key) && (kind !== "essential" || !progress[c.key]?.known))
    .sort(
      (a, b) =>
        (traversal === "breadth" ? a.prefix.length - b.prefix.length : 0) || a.order - b.order,
    );
};

export const OpeningEditor = ({
  initial,
  libraryPanel,
}: {
  initial: OpeningCopy;
  libraryPanel: ReactNode;
}) => {
  const queryClient = useQueryClient();
  const [copy, setCopy] = useState(initial);
  const [doc, setDocumentState] = useState(initial.document);
  const { settings: practiceSettings, updateSettings: updatePracticeSettings } =
    usePracticeSettings();
  const docRef = useRef(doc);
  const setDoc = useCallback((update: SetStateAction<OpeningDocument>) => {
    const next = typeof update === "function" ? update(docRef.current) : update;
    docRef.current = next;
    setDocumentState(next);
  }, []);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [mode, setMode] = useState<"edit" | "practice">("edit");
  const [tab, setTab] = useState<"moves" | "database" | "settings">("moves");
  const [kind, setKind] = useState<LineKind>("essential");
  const [traversal, setTraversal] = useState<Traversal>("depth");
  const [early, setEarly] = useState(false);
  const [essentialOnly, setEssentialOnly] = usePersistedState(
    "atomic-puzzles.openings.essentialOnly",
    z.boolean(),
    false,
  );
  const [lineId, setLineId] = useState(doc.lines[0]?.id ?? "");
  const [board, setBoard] = useState<ChessboardState | null>(null);
  const [navigation, setNavigation] = useState<SolutionNavigation | null>(() =>
    buildBoardLoadNavigation({
      fen: doc.startFen,
      pgn: "",
      ply: 0,
    }),
  );
  const navigationRef = useRef(navigation);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsDialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.showModal();
    else settingsDialog.current?.close();
  }, [settingsOpen]);
  const [card, setCard] = useState<OpeningCard | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const covered = useRef(new Set<string>());
  const submitted = useRef("");
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(Date.now());
  const [price, setPrice] = useState(initial.listing?.price ?? 10);
  const [confirm, setConfirm] = useState<"publish" | "update" | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const state = getBoardMoveState(board, doc.startFen);
  const cards = useMemo(() => openingCards(doc), [doc]);
  const kinds = useMemo(() => openingLineKinds(doc), [doc]);
  const visibleLines = useMemo(() => visibleOpeningLines(doc, essentialOnly), [doc, essentialOnly]);
  const visibleSans = useMemo(
    () => visibleLines.map((line) => openingLineSans(doc, line.moves)),
    [doc, visibleLines],
  );
  const essentialKeys = useMemo(
    () => new Set(openingCards(doc, "essential").map((card) => card.key)),
    [doc],
  );
  const dirty = useMemo(
    () =>
      title !== copy.title ||
      description !== copy.description ||
      JSON.stringify(doc) !== JSON.stringify(copy.document),
    [title, description, doc, copy],
  );
  const practiceQueue = useMemo(
    () => quizQueue(doc, copy.progress, kind, traversal, early, covered.current, now),
    [doc, copy.progress, kind, traversal, early, now],
  );
  const cancelAdvance = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (confirm) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirm]);
  useEffect(() => {
    setCopy((c) => ({ ...c, source: initial.source, update_available: initial.update_available }));
  }, [initial.source, initial.update_available]);
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("Leave without saving your changes?"),
    enableBeforeUnload: dirty,
  });

  const queueNavigation = (next: SolutionNavigation) => {
    navigationRef.current = next;
    setNavigation(next);
  };
  const load = (nextDoc: OpeningDocument, prefix: string[]) => {
    const next = buildBoardLoadNavigation({
      fen: nextDoc.startFen,
      pgn: openingPrefixPgn(nextDoc, prefix),
      ply: prefix.length,
    });
    queueNavigation(next);
    submitted.current = "";
  };
  const accept = (next: OpeningCopy, replace = false) => {
    setCopy(next);
    queryClient.setQueryData(["opening", next.owner, next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["openings"] });
    if (replace) {
      setDoc(next.document);
      setTitle(next.title);
      setDescription(next.description);
    }
  };
  const command = async (action: string, extra: Record<string, unknown> = {}) => {
    if (busyRef.current) throw new Error("An opening change is already being saved.");
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await changeOpening({ action, id: copy.id, revision: copy.revision, ...extra });
      accept(next, action === "save" || action === "update");
      if (action === "publish") {
        void queryClient.invalidateQueries({ queryKey: ["coins"] });
        void queryClient.invalidateQueries({ queryKey: ["opening-catalog"] });
      }
      return next;
    } catch (e) {
      setError(getErrorMessage(e, "Unable to save opening."));
      throw e;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = () => command("save", { title, description, document: doc });
  const persistDocument = (next: OpeningDocument) => {
    if (busyRef.current) return;
    setDoc(next);
    void command("save", { title, description, document: next }).catch(() => undefined);
  };
  const navigateRepertoire = (index: number, ply: number) => {
    const line = visibleLines[index];
    if (!line) return;
    setLineId(line.id);
    load(doc, line.moves.slice(0, ply + 1));
  };
  const nextCard = (snapshot = copy) => {
    cancelAdvance();
    const next =
      quizQueue(snapshot.document, snapshot.progress, kind, traversal, early, covered.current)[0] ??
      null;
    setCard(next);
    setFeedback("");
    submitted.current = "";
    if (next) load(snapshot.document, next.prefix);
  };
  const changeMode = (nextMode: "edit" | "practice") => {
    cancelAdvance();
    setMode(nextMode);
    setCard(null);
    setFeedback("");
    if (nextMode === "practice") {
      covered.current.clear();
      nextCard(copy);
    }
  };
  const closeSettings = async () => {
    try {
      if (dirty) await save();
      setSettingsOpen(false);
    } catch {
      /* Keep edits open. */
    }
  };
  const handleState = (next: ChessboardState) => {
    setBoard(next);
    if ((navigationRef.current && navigationRef.current.type !== "play") || busyRef.current) return;
    if (mode === "edit") return;
    const current = getBoardMoveState(next, docRef.current.startFen);
    const path = openingLineUcis(docRef.current, current.currentMoves);
    if (!card || feedback || path.length !== card.prefix.length + 1) return;
    const move = path.at(-1)!;
    const token = `${card.key}:${next.fen}`;
    if (submitted.current === token) return;
    submitted.current = token;
    const alternative = openingCards(docRef.current, kind).find(
      (c) => c.positionKey === card.positionKey && c.move === move,
    );
    if (
      alternative &&
      (covered.current.has(alternative.key) ||
        (kind === "essential" &&
          !early &&
          !openingReviewDue(copy.progress[alternative.key], Date.now())))
    ) {
      setFeedback("That move is valid and already covered. Try another repertoire move.");
      return;
    }
    const answered = alternative ?? card;
    const correct = !!alternative;
    void (async () => {
      try {
        const updated =
          kind === "essential" ? await command("review", { card: answered.key, move }) : copy;
        covered.current.add(answered.key);
        const due = openingReviewDue(copy.progress[answered.key], Date.now());
        setFeedback(
          correct
            ? kind === "essential" && !due
              ? "Correct. Early practice does not change your schedule."
              : "Correct."
            : `Expected ${card.san}. ${kind !== "essential" ? "Quiz attempts are not scheduled." : due ? "This move is due again in one minute." : "Early practice does not change your schedule."}`,
        );
        if (correct) advanceTimer.current = setTimeout(() => nextCard(updated), 350);
      } catch {
        submitted.current = "";
        load(docRef.current, card.prefix);
      }
    })();
  };

  const pgn = useMemo(
    () =>
      mode === "practice"
        ? openingPrefixPgn(doc, card?.prefix ?? [])
        : openingPgn(doc, essentialOnly),
    [mode, doc, card, essentialOnly],
  );
  const document = useBoardDocument({
    fen: state.currentFen,
    pgn,
    boardState: board,
    onCommitFen: () => {
      throw new Error(
        "Set the starting FEN when creating an opening, or import a PGN with a FEN header.",
      );
    },
    onCommitPgn: (text, initialFen) => {
      if (mode !== "edit") return;
      const base = {
        ...doc,
        startFen: initialFen ?? doc.startFen,
        lines: visibleLines,
      };
      const imported = importOpeningPgn(base, text);
      const updated = {
        ...imported,
        lines: [
          ...imported.lines,
          ...(essentialOnly
            ? doc.lines.filter(
                (item) =>
                  kinds.get(item.id)?.some((kind) => kind !== "essential") &&
                  !imported.lines.some((line) => line.id === item.id),
              )
            : []),
        ],
      };
      validateOpeningDocument(updated);
      persistDocument(updated);
      setLineId(updated.lines[0]?.id ?? "");
      load(updated, []);
    },
  });
  const line = doc.lines.find((l) => l.id === lineId) ?? doc.lines[0];
  const knownPly = board?.turn === doc.side ? state.currentPly : Math.max(0, state.currentPly - 1);
  const known = (scope: "position" | "line" | "prefix", value = true) => {
    if (!line) return;
    void (async () => {
      try {
        const snapshot = dirty ? await save() : copy;
        await command("known", {
          revision: snapshot.revision,
          lineId: line.id,
          ply: knownPly,
          scope,
          known: value,
        });
      } catch {
        /* surfaced by command */
      }
    })();
  };
  const nextDue = Object.entries(copy.progress)
    .filter(
      ([key, p]) => essentialKeys.has(key) && !p.known && p.nextDue && p.nextDue !== "infinity",
    )
    .map(([, p]) => Date.parse(p.nextDue!))
    .sort((a, b) => a - b)[0];
  const branchActions = (moves: string[], ply: number) => {
    const prefix = moves.slice(0, ply + 1);
    const selected = doc.lines.find((line) =>
      prefix.every((move, index) => line.moves[index] === move),
    );
    if (!selected) return [];
    const currentKind = kinds.get(selected.id)?.[ply] ?? "essential";
    return lineKinds.map(({ kind, label }) => ({
      checked: kind === currentKind,
      label,
      onSelect: () => persistDocument(markOpeningBranch(docRef.current, prefix, kind)),
    }));
  };
  const boardControls = (
    <div className="openingUnderboard">
      <div className="openingActions" role="group" aria-label="Opening mode">
        <button disabled={busy} aria-pressed={mode === "edit"} onClick={() => changeMode("edit")}>
          Edit
        </button>
        <button
          aria-pressed={mode === "practice"}
          disabled={busy || dirty || !doc.lines.length}
          onClick={() => changeMode("practice")}
        >
          Practice
        </button>
        <button disabled={busy} onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
      </div>
      {mode === "practice" ? (
        <>
          <label className="openingCheck">
            <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} />
            Include moves not due · no progress
          </label>
          <p role="status">
            {feedback ||
              (card
                ? `Your move as ${doc.side}.`
                : kind === "essential"
                  ? nextDue && nextDue > now
                    ? `Caught up. Next review ${new Date(nextDue).toLocaleString()}.`
                    : "No moves due."
                  : "Quiz complete.")}
          </p>
          <p>
            {practiceQueue.length} {kind === "essential" ? "moves due" : "quiz moves remaining"}
          </p>
          {feedback ? (
            <button
              disabled={busy}
              onClick={() => {
                if (feedback.startsWith("That move")) {
                  setFeedback("");
                  load(doc, card!.prefix);
                } else nextCard();
              }}
            >
              Continue
            </button>
          ) : !card ? (
            <button onClick={() => nextCard()}>Check for due moves</button>
          ) : null}
        </>
      ) : null}
    </div>
  );
  return (
    <>
      {error && !settingsOpen && !confirm ? <p role="alert">{error}</p> : null}
      <section className="openingWorkspace">
        <AnalysisPage
          initialFen={doc.startFen}
          workspace={{
            navigation,
            leftPanel: (
              <OpeningTree
                document={doc}
                progress={copy.progress}
                libraryPanel={libraryPanel}
                lines={visibleLines}
                currentMoves={state.currentMoves}
                training={mode === "practice"}
                essentialOnly={essentialOnly}
                onEssentialOnlyChange={setEssentialOnly}
                onNavigate={navigateRepertoire}
                moveActions={(index, ply) => branchActions(visibleLines[index]?.moves ?? [], ply)}
              />
            ),
            onPlayNavigation: queueNavigation,
            practiceSettings,
            continuationChoices:
              mode === "practice" ? null : (
                <AnalysisContinuationChoices
                  lines={visibleSans}
                  moves={state.currentMoves}
                  currentPly={state.currentPly}
                  initialPly={startingPlyFromFen(doc.startFen)}
                  onSelect={navigateRepertoire}
                />
              ),
            onNavigateHandled: () => {
              navigationRef.current = null;
              setNavigation(null);
            },
            onStateChange: handleState,
            orientation: doc.side,
            disabled: busy || (mode === "practice" && (!card || !!feedback)),
            training: mode === "practice",
            boardAfter: boardControls,
            moveActions:
              mode === "edit"
                ? (index, ply) => {
                    const path = openingLineUcis(doc, state.lines[index] ?? []).slice(0, ply + 1);
                    return lineKinds.map(({ kind, label }) => ({
                      label: `Add ${label.toLowerCase()} line`,
                      onSelect: () => {
                        if (busyRef.current || !path.length) return;
                        const updated = addOpeningLine(docRef.current, path, kind);
                        const added = updated.lines.find(
                          (line) =>
                            line.moves.length === path.length &&
                            line.moves.every((move, ply) => move === path[ply]),
                        );
                        if (added) setLineId(added.id);
                        persistDocument(updated);
                      },
                    }));
                  }
                : undefined,
            document: {
              ...document,
              fen: { ...document.fen, readOnly: true },
              pgn: {
                ...document.pgn,
                readOnly: busy || mode !== "edit",
              },
            },
          }}
        />
        <dialog
          ref={settingsDialog}
          className="openingConfirm openingSettingsDialog"
          onCancel={(event) => {
            event.preventDefault();
            void closeSettings();
          }}
        >
          <header className="openingHeader">
            <h2>Opening settings</h2>
            <button aria-label="Close opening settings" onClick={() => void closeSettings()}>
              ×
            </button>
          </header>
          <fieldset disabled={busy} className="openingControlPanel" aria-label="Opening controls">
            {error && !confirm ? <p role="alert">{error}</p> : null}
            <div className="openingActions">
              <label>
                Lines
                <select
                  value={kind}
                  onChange={(e) => {
                    changeMode("edit");
                    setKind(e.target.value as LineKind);
                  }}
                >
                  {lineKinds.map(({ kind, label }) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Order
                <select
                  value={traversal}
                  onChange={(e) => setTraversal(e.target.value as Traversal)}
                >
                  <option value="depth">Depth first</option>
                  <option value="breadth">Breadth first</option>
                </select>
              </label>
            </div>
            <>
              <div className="openingTabs" role="group" aria-label="Opening panels">
                {(["moves", "database", "settings"] as const).map((item) => (
                  <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>
                    {item === "moves" ? "Lines" : item === "database" ? "Practice" : "General"}
                  </button>
                ))}
              </div>
              {tab === "moves" ? (
                <div className="openingTabContent">
                  {line ? (
                    <div className="openingActions openingSelectedLine">
                      <button
                        onClick={() => {
                          const updated = {
                            ...doc,
                            lines: doc.lines.filter((item) => item.id !== line.id),
                          };
                          persistDocument(updated);
                          setLineId(updated.lines[0]?.id ?? "");
                          load(updated, []);
                        }}
                      >
                        Delete line
                      </button>
                    </div>
                  ) : null}
                  <div className="openingActions">
                    <button disabled={busy || !line} onClick={() => known("position")}>
                      Know this move
                    </button>
                    <button disabled={busy || !line} onClick={() => known("line")}>
                      Know this line
                    </button>
                    <button disabled={busy || !line} onClick={() => known("prefix")}>
                      Know up to here
                    </button>
                    <button disabled={busy || !line} onClick={() => known("position", false)}>
                      Schedule this move
                    </button>
                  </div>
                  <small>
                    {cards.filter((c) => copy.progress[c.key]?.known).length} known · known moves
                    are never scheduled.
                  </small>
                </div>
              ) : tab === "database" ? (
                <div className="openingTabContent">
                  <label>
                    Move choice
                    <select
                      value={practiceSettings.opponentMode}
                      onChange={(event) =>
                        updatePracticeSettings({
                          opponentMode: event.target.value as "frequency" | "random" | "popular",
                        })
                      }
                    >
                      <option value="frequency">Frequency</option>
                      <option value="random">Random</option>
                      <option value="popular">Popular</option>
                    </select>
                  </label>
                  <label>
                    When player games run out
                    <select
                      value={practiceSettings.playerContinuation}
                      onChange={(event) =>
                        updatePracticeSettings({
                          playerContinuation: event.target.value as "general" | "engine",
                        })
                      }
                    >
                      <option value="engine">Engine</option>
                      <option value="general">General database, then engine</option>
                    </select>
                  </label>
                  <PracticeEngineSettings
                    value={practiceSettings.engine}
                    onChange={(engine) => updatePracticeSettings({ engine })}
                  />
                </div>
              ) : (
                <div className="openingTabContent">
                  <label>
                    Name
                    <input
                      value={title}
                      maxLength={100}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={description}
                      maxLength={500}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  {!copy.source_listing_id ? (
                    <fieldset disabled={busy}>
                      <legend>Sell this opening</legend>
                      <label>
                        Price · coins
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={price}
                          onChange={(e) => setPrice(Number(e.target.value))}
                        />
                      </label>
                      <p>
                        You receive 90% of sales. Publishing costs 50 coins once. Saving later edits
                        updates your listing and notifies buyers.
                      </p>
                      <button
                        disabled={
                          !doc.lines.length || !title.trim() || !Number.isFinite(price) || price < 0
                        }
                        onClick={() => setConfirm("publish")}
                      >
                        {copy.listing ? "Update price" : "Publish · 50 coins"}
                      </button>
                    </fieldset>
                  ) : null}
                </div>
              )}
            </>
            {copy.update_available ? (
              <div className="openingUpdateNotice">
                <p>
                  An update from {copy.source?.author} is available. Applying it replaces your
                  edits.
                </p>
                <button disabled={busy} onClick={() => setConfirm("update")}>
                  Review update
                </button>
              </div>
            ) : null}
          </fieldset>
        </dialog>
      </section>
      <dialog ref={dialogRef} className="openingConfirm" onCancel={() => setConfirm(null)}>
        <h2>
          {confirm === "update"
            ? "Replace your copy with the latest version?"
            : copy.listing
              ? "Update the price?"
              : "Publish this opening?"}
        </h2>
        <p>
          {confirm === "update"
            ? "Your local edits, name, and description will be replaced. Progress for unchanged positions and moves is kept."
            : copy.listing
              ? `The price will be ${price} coins. There is no additional publishing fee.`
              : `Publishing costs 50 coins. Buyers pay ${price} coins and you receive 90% of each sale.`}
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <div className="openingActions">
          <button
            disabled={busy}
            onClick={() => {
              const action = confirm;
              void (async () => {
                const snapshot = action === "publish" && dirty ? await save() : copy;
                return command(action === "update" ? "update" : "publish", {
                  revision: snapshot.revision,
                  ...(action === "update" ? { confirmReplacement: true } : { price }),
                });
              })()
                .then((next) => {
                  setConfirm(null);
                  if (action === "update") {
                    changeMode("edit");
                    load(next.document, []);
                  }
                })
                .catch(() => undefined);
            }}
          >
            Confirm
          </button>
          <button disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
};
