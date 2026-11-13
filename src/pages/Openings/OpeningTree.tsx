import "../../components/AnalysisMoveTree/AnalysisMoveTree.css";

import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  type OpeningDocument,
  openingKnownMoves,
  type OpeningLine,
  openingLineKinds,
  openingLineSans,
  type OpeningProgress,
} from "../../../shared/domain/openings/repertoire";
import { AnalysisContinuationChoices } from "../../components/AnalysisMoveTree/AnalysisMoveTree";
import { boardShortcutCommand } from "../../components/Chessboard/boardShortcuts";
import {
  type AnnotationMenuPosition,
  annotationMenuPosition,
  MoveAnnotationMenu,
  type MoveMenuAction,
} from "../../components/MoveAnnotationMenu/MoveAnnotationMenu";
import { useKeyboardShortcutSettings } from "../../context/AppSettings";
import {
  buildIndexedSolutionMoveTree,
  formatSolutionMove,
  type IndexedSolutionMoveNode,
  movePrefix,
  startingPlyFromFen,
} from "../../lib/chess/pgn";

type Props = {
  document: OpeningDocument;
  progress: OpeningProgress;
  libraryPanel: ReactNode;
  lines: OpeningLine[];
  currentMoves: string[];
  training: boolean;
  essentialOnly: boolean;
  onEssentialOnlyChange: (value: boolean) => void;
  onNavigate: (lineIndex: number, ply: number) => void;
  moveActions: (lineIndex: number, ply: number) => MoveMenuAction[];
};

type TreeMove = { node: IndexedSolutionMoveNode; path: string[]; ply: number };

export const OpeningTree = ({
  document,
  progress,
  libraryPanel,
  lines,
  currentMoves,
  training,
  essentialOnly,
  onEssentialOnlyChange,
  onNavigate,
  moveActions,
}: Props) => {
  const shortcuts = useKeyboardShortcutSettings();
  const panelRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<"tree" | "repertoires">("tree");
  const sans = useMemo(
    () => lines.map((line) => openingLineSans(document, line.moves)),
    [document, lines],
  );
  const tree = useMemo(() => buildIndexedSolutionMoveTree(sans), [sans]);
  const kinds = useMemo(() => openingLineKinds(document), [document]);
  const knownMoves = useMemo(() => openingKnownMoves(document, progress), [document, progress]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{
    index: number;
    ply: number;
    position: AnnotationMenuPosition;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activePath = currentMoves.join(" ");
  useEffect(() => {
    const moves = activePath ? activePath.split(" ") : [];
    setExpanded((previous) => {
      const paths = moves.slice(0, -1).map((_, index) => moves.slice(0, index + 1).join(" "));
      return paths.every((path) => previous[path])
        ? previous
        : { ...previous, ...Object.fromEntries(paths.map((path) => [path, true])) };
    });
  }, [activePath]);
  useLayoutEffect(() => {
    const pane = scrollRef.current;
    const active = pane?.querySelector<HTMLElement>("[aria-current='step']");
    const panel = panelRef.current;
    if (panel?.contains(panel.ownerDocument.activeElement)) {
      (active ?? panel).focus({ preventScroll: true });
    }
    if (!pane || !active) return;
    const row = active.getBoundingClientRect(),
      bounds = pane.getBoundingClientRect();
    if (row.top < bounds.top) pane.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom) pane.scrollTop += row.bottom - bounds.bottom;
  }, [activePath, expanded]);
  const initialPly = startingPlyFromFen(document.startFen);
  const navigate = (index: number, ply: number) => {
    // Keep focus on a stable element when the selected option disappears.
    panelRef.current?.focus({ preventScroll: true });
    onNavigate(index, ply);
  };
  const targetIndex = (node: IndexedSolutionMoveNode) =>
    [...node.lineIndexes].find((index) =>
      currentMoves.every((move, ply) => sans[index]?.[ply] === move),
    ) ??
    [...node.lineIndexes][0] ??
    0;
  const ancestors = [tree];
  for (const move of currentMoves) {
    const child = ancestors.at(-1)!.children.get(move);
    if (!child) break;
    ancestors.push(child);
  }
  const current = ancestors.at(-1)!;
  const ply = ancestors.length - 2;
  const cycleOptions = (command: "previousOption" | "nextOption") => {
    // Prefer the choices ahead; otherwise switch at the nearest earlier fork.
    for (let depth = ancestors.length - 1; depth >= 0; depth--) {
      const choices = [...ancestors[depth]!.children.values()];
      if (choices.length < 2) continue;
      const selected = ancestors[depth + 1];
      const index = Math.max(0, selected ? choices.indexOf(selected) : 0);
      const delta = command === "previousOption" ? -1 : 1;
      const next = choices[(index + delta + choices.length) % choices.length]!;
      navigate(targetIndex(next), depth);
      return;
    }
  };

  const renderMove = ({ node, path, ply }: TreeMove, first: boolean) => {
    const index = targetIndex(node);
    const known = knownMoves.get(lines[index]?.id ?? "")?.[ply] ?? false;
    const kind = kinds.get(lines[index]?.id ?? "")?.[ply] ?? "essential";
    const active =
      path.length === currentMoves.length &&
      path.every((move, index) => currentMoves[index] === move);
    return (
      <span className="openingTreeToken" key={path.join(" ")}>
        <span className="openingTreeNumber">{movePrefix(initialPly + ply, first)}</span>
        <button
          className={`analysisTreeMove openingTreeMove${active ? " active" : ""}`}
          data-kind={kind}
          data-known={known}
          aria-current={active ? "step" : undefined}
          aria-label={`${movePrefix(initialPly + ply, true).trim()} ${formatSolutionMove(node.move!)}`}
          title={
            known
              ? "Already known"
              : kind === "mate"
                ? "Mating line"
                : kind === "tertiary"
                  ? "Tertiary line"
                  : undefined
          }
          onClick={() => navigate(index, ply)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ index, ply, position: annotationMenuPosition(event) });
          }}
        >
          {formatSolutionMove(node.move!)}
        </button>
      </span>
    );
  };

  const render = (
    parent: IndexedSolutionMoveNode,
    path: string[],
    ply: number,
    depth: number,
  ): ReactNode =>
    [...parent.children.values()].map((first) => {
      // Keep a linear continuation on one row. A new row is needed only at a branch.
      const run: TreeMove[] = [{ node: first, path: [...path, first.move!], ply }];
      while (run.at(-1)!.node.children.size === 1) {
        const tail = run.at(-1)!;
        const next = tail.node.children.values().next().value!;
        run.push({ node: next, path: [...tail.path, next.move!], ply: tail.ply + 1 });
      }
      const key = run[0]!.path.join(" ");
      const open = expanded[key] ?? depth < 3;
      const tail = run.at(-1)!;
      return (
        <li key={key}>
          <div className="openingTreeRow">
            {first.children.size ? (
              <button
                className="openingTreeToggle"
                aria-label={`${open ? "Collapse" : "Expand"} ${key}`}
                aria-expanded={open}
                onClick={() => setExpanded((value) => ({ ...value, [key]: !open }))}
              >
                {open ? "−" : "+"}
              </button>
            ) : (
              <span className="openingTreeLeaf" />
            )}
            <div className="openingTreeMoves">
              {(open ? run : run.slice(0, 1)).map((move, index) => renderMove(move, index === 0))}
            </div>
          </div>
          {open && tail.node.children.size ? (
            <ul>{render(tail.node, tail.path, tail.ply + 1, depth + 1)}</ul>
          ) : null}
        </li>
      );
    });
  return (
    <aside
      ref={panelRef}
      className="panel openingRepertoire"
      aria-label="Repertoire tree"
      data-board-navigation="local"
      tabIndex={0}
      onPointerDownCapture={(event) => event.currentTarget.focus({ preventScroll: true })}
      onKeyDownCapture={(event) => {
        if (event.nativeEvent.isComposing) return;
        const command = boardShortcutCommand(event.nativeEvent, true, shortcuts);
        if (!command) return;
        // Own navigation while this panel has focus; the board must not handle it again.
        event.preventDefault();
        event.stopPropagation();
        if (training || tab !== "tree" || menu) return;
        if (command === "previous") {
          if (ply >= 0) navigate(targetIndex(current), ply - 1);
        } else if (command === "next") {
          const next = current.children.values().next().value;
          if (next) navigate(targetIndex(next), ply + 1);
        } else if (command === "previousOption" || command === "nextOption") cycleOptions(command);
      }}
    >
      <header className="openingTreeHeader">
        <div className="analysisExplorerTabs" role="tablist" aria-label="Repertoire panels">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tree"}
            className={tab === "tree" ? "active" : ""}
            onClick={() => setTab("tree")}
          >
            Tree
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "repertoires"}
            className={tab === "repertoires" ? "active" : ""}
            onClick={() => setTab("repertoires")}
          >
            Repertoires
          </button>
        </div>
      </header>
      {tab === "repertoires" ? (
        libraryPanel
      ) : !training ? (
        <>
          <label className="openingCheck openingTreeFilter">
            <input
              type="checkbox"
              checked={essentialOnly}
              onChange={(event) => onEssentialOnlyChange(event.target.checked)}
            />
            Essential only
          </label>
          <div className="openingTreeScroll" ref={scrollRef}>
            <ul className="openingTree">{render(tree, [], 0, 0)}</ul>
          </div>
          <AnalysisContinuationChoices
            lines={sans}
            moves={currentMoves}
            currentPly={currentMoves.length}
            initialPly={initialPly}
            onSelect={navigate}
            onCycleOptions={cycleOptions}
          />
        </>
      ) : null}
      {menu ? (
        <MoveAnnotationMenu
          position={menu.position}
          current=""
          actions={moveActions(menu.index, menu.ply)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </aside>
  );
};
