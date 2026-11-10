import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AtomicDbAnalysisState } from "../../hooks/useAtomicDbAnalysis";
import { parseAtomicDbResponse } from "../../utils/atomicDb";
import { AtomicDbEngine, AtomicDbEngineControls, AtomicDbEvalBar } from "./AtomicDbEngine";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("AtomicDbEngine", () => {
  it("toggles analysis with L outside text-entry controls", () => {
    const setSettings = vi.fn();
    const onDisable = vi.fn();
    render(
      <>
        <AtomicDbEngineControls
          fen={STARTING_FEN}
          analysis={{ status: "idle", error: "", result: null, principalVariations: {} }}
          settings={{ enabled: false, lineCount: 1, showFollowUpMoves: true }}
          setSettings={setSettings}
          onDisable={onDisable}
        />
        <input aria-label="Position note" />
      </>,
    );

    fireEvent.keyDown(window, { key: "l" });
    expect(setSettings).toHaveBeenCalledOnce();
    expect(
      setSettings.mock.calls[0]?.[0]({
        enabled: false,
        lineCount: 1,
        showFollowUpMoves: true,
      }),
    ).toMatchObject({ enabled: true });
    expect(onDisable).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Position note" }), { key: "l" });
    expect(setSettings).toHaveBeenCalledOnce();
  });

  it("can bypass AtomicDB from the shared engine settings", () => {
    const setSettings = vi.fn();
    const onDisable = vi.fn();
    render(
      <AtomicDbEngineControls
        fen={STARTING_FEN}
        analysis={{ status: "idle", error: "", result: null, principalVariations: {} }}
        settings={{ enabled: true, lineCount: 1, showFollowUpMoves: true }}
        setSettings={setSettings}
        onDisable={onDisable}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Engine settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Use AtomicDB" }));

    expect(setSettings).toHaveBeenCalledOnce();
    expect(
      setSettings.mock.calls[0]?.[0]({
        enabled: true,
        lineCount: 1,
        showFollowUpMoves: true,
      }),
    ).toMatchObject({ enabled: true, atomicDbEnabled: false });
    expect(onDisable).not.toHaveBeenCalled();
  });

  it("keeps the selected line count visible and editable while analysis is off", () => {
    const setSettings = vi.fn();
    const onDisable = vi.fn();
    render(
      <AtomicDbEngineControls
        fen={STARTING_FEN}
        analysis={{ status: "idle", error: "", result: null, principalVariations: {} }}
        settings={{ enabled: false, lineCount: 3, showFollowUpMoves: true }}
        setSettings={setSettings}
        onDisable={onDisable}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Engine settings" }));

    const lineCount = screen.getByRole("slider", { name: "Multiple lines" });
    expect(lineCount).toHaveValue("3");
    expect(screen.getByText("3", { selector: "output" })).toBeVisible();

    fireEvent.change(lineCount, { target: { value: "4" } });
    expect(
      setSettings.mock.calls[0]?.[0]({
        enabled: false,
        lineCount: 3,
        showFollowUpMoves: true,
      }),
    ).toEqual({ enabled: false, lineCount: 4, showFollowUpMoves: true });
    expect(onDisable).not.toHaveBeenCalled();
  });

  it("links to AtomicDB and lists Stockfish only when it scores a substantial share of visible moves", () => {
    const position = parseAtomicDbResponse({
      key: "atomic-position-key",
      status: "UNKNOWN",
      score: 1100,
      best_move: "g1f3",
      moves: ["g1f3", "e2e4", "d2d4", "g1h3", "c2c4"].map((uci) => ({
        uci,
        status: "UNKNOWN",
        score: 1100,
      })),
    })!;
    position.moves = position.moves.map((move, index) => ({
      ...move,
      ...(index === 0 ? { variationSource: "engine" as const } : {}),
      ...(index >= 3 ? { origin: "engine" as const } : {}),
    }));
    const controls = (lineCount: number) => (
      <AtomicDbEngineControls
        fen={STARTING_FEN}
        analysis={{
          status: "ready",
          error: "",
          source: "mixed",
          result: { fen: STARTING_FEN, position },
          principalVariations: {},
        }}
        settings={{ enabled: true, lineCount, showFollowUpMoves: true }}
        setSettings={vi.fn()}
        onDisable={vi.fn()}
      />
    );
    const { rerender } = render(controls(4));
    const source = screen.getByRole("link", { name: "Open this position on AtomicDB" });
    expect(source).toHaveAttribute(
      "href",
      "https://belzedar.duckdns.org/atomicdb/explore/atomic-position-key/",
    );
    expect(source).toHaveTextContent(/^AtomicDB$/);

    rerender(controls(5));
    expect(source).toHaveTextContent("AtomicDB + Atomic-Stockfish");
  });

  it("shows an evaluation instead of a game result for a non-terminal solved position", () => {
    const fen = "nrkn1qrb/ppp1pppp/8/1Q1p4/b7/1N2P3/PPPP1PPP/1RKNB1RB b KQkq - 3 3";
    const position = parseAtomicDbResponse({
      status: "WHITE_WIN",
      closure: "MATE_PV",
      score: -10000,
      point: -9997,
      best_move: "a4b5",
      moves: [],
    });
    const analysis: AtomicDbAnalysisState = {
      status: "ready",
      error: "",
      source: "atomicdb",
      result: { fen, position },
      principalVariations: {},
    };

    render(
      <>
        <AtomicDbEngineControls
          fen={fen}
          analysis={analysis}
          settings={{ enabled: true, lineCount: 1, showFollowUpMoves: true }}
          setSettings={vi.fn()}
          onDisable={vi.fn()}
        />
        <AtomicDbEvalBar fen={fen} analysis={analysis} enabled orientation="white" />
      </>,
    );

    expect(screen.queryByText("1–0")).not.toBeInTheDocument();
    expect(screen.getByText("#3")).toBeVisible();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "AtomicDB evaluation #3");
  });

  it("hides local-engine depth for mate moves but keeps it for centipawn moves", () => {
    const analysis: AtomicDbAnalysisState = {
      status: "ready",
      error: "",
      source: "engine",
      result: {
        fen: STARTING_FEN,
        position: {
          key: null,
          outcome: "UNKNOWN",
          closure: null,
          score: null,
          point: null,
          bestMove: "g1f3",
          moves: [
            {
              uci: "g1f3",
              origin: "engine",
              outcome: "UNKNOWN",
              closure: null,
              score: null,
              point: null,
              mate: 4,
              nodeBackedPlies: null,
              searchDepth: 22,
            },
            {
              uci: "e2e4",
              origin: "engine",
              outcome: "UNKNOWN",
              closure: null,
              score: 125,
              point: null,
              mate: null,
              nodeBackedPlies: null,
              searchDepth: 22,
            },
          ],
        },
      },
      principalVariations: {},
    };

    render(
      <AtomicDbEngine
        fen={STARTING_FEN}
        settings={{ enabled: true, lineCount: 2, showFollowUpMoves: true }}
        analysis={analysis}
        onPlayLine={vi.fn()}
        onHoverMove={vi.fn()}
      />,
    );

    expect(screen.getAllByText("depth 22")).toHaveLength(1);
    expect(screen.getByText("#4").closest("li")).not.toHaveTextContent("depth");
  });

  it("presents the move position's backing separately from search depth", () => {
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: -320,
      best_move: "g1f3",
      moves: [
        {
          uci: "g1f3",
          status: "UNKNOWN",
          score: -320,
          backed_plies: 22,
          node_backed_plies: 44,
        },
      ],
    });

    render(
      <AtomicDbEngine
        fen={STARTING_FEN}
        settings={{ enabled: true, lineCount: 1, showFollowUpMoves: false }}
        analysis={{
          status: "ready",
          error: "",
          source: "atomicdb",
          result: { fen: STARTING_FEN, position },
          principalVariations: {},
        }}
        onPlayLine={vi.fn()}
        onHoverMove={vi.fn()}
      />,
    );

    expect(screen.getByText("depth 44")).toHaveAttribute(
      "title",
      "AtomicDB move position backing depth 44",
    );
    expect(screen.getByRole("listitem")).not.toHaveTextContent("backed");
    expect(screen.getByRole("listitem")).toHaveAttribute(
      "aria-label",
      "Evaluation -3.2, move position backing depth 44, line 1. Nf3",
    );
  });

  it("reserves the configured row count while loading and when fewer moves are legal", () => {
    const fen = "rn1r4/pp2kR1p/2p5/5P1P/1P6/4P3/P1P5/2K5 b - - 8 27";
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 0,
      best_move: "e7d6",
      moves: [
        { uci: "e7d6", status: "DRAW", score: 0 },
        { uci: "e7e8", status: "WHITE_WIN", mate: 2 },
      ],
    });

    const settings = { enabled: true, lineCount: 5, showFollowUpMoves: false };
    const analysis: AtomicDbAnalysisState = {
      status: "ready",
      error: "",
      source: "mixed",
      engine: "atomic-stockfish",
      result: { fen, position },
      principalVariations: {},
    };
    const onHoverMove = vi.fn();
    const onPlayLine = vi.fn();
    const { container, rerender } = render(
      <AtomicDbEngine
        fen={fen}
        settings={settings}
        analysis={{ ...analysis, status: "loading", result: null }}
        onPlayLine={onPlayLine}
        onHoverMove={onHoverMove}
      />,
    );
    const rows = () => container.querySelectorAll(".atomicDbEngineLines > li");
    expect(screen.getByText("Loading analysis…")).toBeVisible();
    expect(rows()).toHaveLength(5);

    rerender(
      <AtomicDbEngine
        fen={fen}
        settings={settings}
        analysis={analysis}
        onPlayLine={onPlayLine}
        onHoverMove={onHoverMove}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(rows()).toHaveLength(5);
    for (const row of Array.from(rows()).slice(2)) expect(row).toBeEmptyDOMElement();
  });

  it("keeps an analyzed game's stored search depth visible before a refresh", () => {
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 470,
      best_move: "g1f3",
      moves: [{ uci: "g1f3", status: "UNKNOWN", score: 450, backed_plies: 0 }],
      analysis: { lines: [{ move: "g1f3", cp: 450, depth: 26, pv: ["g1f3"] }] },
    });

    render(
      <AtomicDbEngine
        fen={STARTING_FEN}
        settings={{ enabled: true, lineCount: 1, showFollowUpMoves: false }}
        analysis={{
          status: "ready",
          error: "",
          result: { fen: STARTING_FEN, position },
          principalVariations: { g1f3: ["g1f3"] },
        }}
        onPlayLine={vi.fn()}
        onHoverMove={vi.fn()}
      />,
    );

    expect(screen.getByText("depth 26")).toHaveAttribute("title", "Search depth 26");
  });

  it("keeps the settled evaluation and bar position while the next evaluation loads", () => {
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 1100,
      best_move: "g1f3",
      moves: [{ uci: "g1f3", status: "UNKNOWN", score: 1100 }],
    });
    const readyAnalysis: AtomicDbAnalysisState = {
      status: "ready",
      error: "",
      result: { fen: STARTING_FEN, position },
      principalVariations: {},
    };
    const settings = { enabled: true, lineCount: 1, showFollowUpMoves: true };
    const renderDisplay = (analysis: AtomicDbAnalysisState) => (
      <>
        <AtomicDbEngineControls
          fen={STARTING_FEN}
          analysis={analysis}
          settings={settings}
          setSettings={vi.fn()}
          onDisable={vi.fn()}
        />
        <AtomicDbEvalBar fen={STARTING_FEN} analysis={analysis} enabled orientation="white" />
      </>
    );
    const { rerender } = render(renderDisplay(readyAnalysis));
    const settledBarValue = screen.getByRole("meter").getAttribute("aria-valuenow");

    rerender(
      renderDisplay({
        ...readyAnalysis,
        status: "loading",
        result: null,
      }),
    );

    expect(screen.getByText("+11.0")).toBeVisible();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", settledBarValue);
  });

  it("keeps the Wolfrandom opening bar neutral without exposing a loading state", () => {
    const analysis: AtomicDbAnalysisState = {
      status: "idle",
      error: "",
      result: null,
      principalVariations: {},
    };

    render(
      <AtomicDbEvalBar
        fen={STARTING_FEN}
        analysis={analysis}
        enabled
        neutral
        orientation="white"
      />,
    );

    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-label",
      "Wolfrandom opening evaluation 0.0",
    );
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "50");
  });

  it("replaces stale analysis with the final result when the game is over", () => {
    const terminalFen = "rn3bnr/p1p4p/6p1/1p1PPp2/4P3/N7/PPP2PPP/R1B1KB1R b KQ - 0 8";
    const terminalAnalysis: AtomicDbAnalysisState = {
      status: "ready",
      error: "",
      source: "terminal",
      result: {
        fen: terminalFen,
        position: {
          key: null,
          outcome: "WHITE_WIN",
          closure: null,
          score: null,
          point: null,
          bestMove: null,
          moves: [],
        },
      },
      principalVariations: {},
    };
    const settings = { enabled: true, lineCount: 3, showFollowUpMoves: true };

    const { container } = render(
      <>
        <AtomicDbEngineControls
          fen={terminalFen}
          analysis={terminalAnalysis}
          settings={settings}
          setSettings={vi.fn()}
          onDisable={vi.fn()}
        />
        <AtomicDbEngine
          fen={terminalFen}
          settings={settings}
          analysis={terminalAnalysis}
          onPlayLine={vi.fn()}
          onHoverMove={vi.fn()}
        />
        <AtomicDbEvalBar
          fen={terminalFen}
          analysis={terminalAnalysis}
          enabled
          orientation="white"
        />
      </>,
    );

    expect(screen.getByText("1–0")).toBeVisible();
    expect(screen.getByText("Game over")).toBeVisible();
    const reservedRows = container.querySelectorAll(".atomicDbEngineLines > li");
    expect(reservedRows).toHaveLength(settings.lineCount);
    for (const row of reservedRows) expect(row).toBeEmptyDOMElement();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
  });

  it("makes each principal-variation move play through its own ply", () => {
    const onPlayLine = vi.fn();
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 1100,
      best_move: "g1f3",
      moves: [
        { uci: "g1f3", status: "UNKNOWN", score: 1100, backed_plies: 29 },
        { uci: "g1h3", status: "UNKNOWN", score: 786, backed_plies: 31 },
      ],
    });

    render(
      <AtomicDbEngine
        fen={STARTING_FEN}
        settings={{ enabled: true, lineCount: 2, showFollowUpMoves: true }}
        analysis={{
          status: "ready",
          error: "",
          result: { fen: STARTING_FEN, position },
          principalVariations: {
            g1f3: ["g1f3", "f7f6", "e2e3", "d7d5", "f3g5"],
            g1h3: ["g1h3"],
          },
        }}
        onPlayLine={onPlayLine}
        onHoverMove={() => undefined}
      />,
    );

    const principalVariation = screen.getByRole("listitem", { name: /line 1\. Nf3 f6 2\. e3/ });
    fireEvent.click(
      within(principalVariation).getByRole("button", { name: "Play variation through e3" }),
    );
    expect(onPlayLine).toHaveBeenCalledWith(["g1f3", "f7f6", "e2e3"]);

    const singleMove = screen.getByRole("listitem", { name: /line 1\. Nh3/ });
    fireEvent.click(within(singleMove).getByRole("button", { name: "Play variation through Nh3" }));
    expect(onPlayLine).toHaveBeenCalledWith(["g1h3"]);
  });

  it("clears a move preview when the pointer leaves or the analyzed lines change", () => {
    const onHoverMove = vi.fn();
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 1100,
      best_move: "g1f3",
      moves: [{ uci: "g1f3", status: "UNKNOWN", score: 1100 }],
    });
    const props = {
      fen: STARTING_FEN,
      settings: { enabled: true, lineCount: 1, showFollowUpMoves: false },
      onPlayLine: vi.fn(),
      onHoverMove,
    };
    const { rerender } = render(
      <AtomicDbEngine
        {...props}
        analysis={{
          status: "ready",
          error: "",
          result: { fen: STARTING_FEN, position },
          principalVariations: {},
        }}
      />,
    );

    fireEvent.pointerEnter(screen.getByRole("button", { name: "Play variation through Nf3" }));
    expect(onHoverMove).toHaveBeenLastCalledWith("g1f3");

    fireEvent.pointerLeave(screen.getByRole("region", { name: "Position analysis lines" }));
    expect(onHoverMove).toHaveBeenLastCalledWith(null);

    const nextPosition = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 900,
      best_move: "g1h3",
      moves: [{ uci: "g1h3", status: "UNKNOWN", score: 900 }],
    });
    rerender(
      <AtomicDbEngine
        {...props}
        analysis={{
          status: "ready",
          error: "",
          result: { fen: STARTING_FEN, position: nextPosition },
          principalVariations: {},
        }}
      />,
    );
    expect(onHoverMove).toHaveBeenLastCalledWith(null);
  });

  it("shows only each root move and its evaluation when follow-up moves are off", () => {
    const position = parseAtomicDbResponse({
      status: "UNKNOWN",
      score: 1100,
      best_move: "g1f3",
      moves: [{ uci: "g1f3", status: "UNKNOWN", score: 1100, backed_plies: 29 }],
    });

    render(
      <AtomicDbEngine
        fen={STARTING_FEN}
        settings={{ enabled: true, lineCount: 1, showFollowUpMoves: false }}
        analysis={{
          status: "ready",
          error: "",
          result: { fen: STARTING_FEN, position },
          principalVariations: {
            g1f3: ["g1f3", "f7f6", "e2e3"],
          },
        }}
        onPlayLine={() => undefined}
        onHoverMove={() => undefined}
      />,
    );

    const engineLine = screen.getByRole("listitem", { name: /line 1\. Nf3$/ });
    expect(within(engineLine).getByText("+11.0")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Play variation through f6" }),
    ).not.toBeInTheDocument();
  });
});
