import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AtomicDbAnalysisState } from "../../hooks/useAtomicDbAnalysis";
import { parseAtomicDbResponse } from "../../utils/atomicDb";
import { AtomicDbEngine, AtomicDbEngineControls, AtomicDbEvalBar } from "./AtomicDbEngine";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("AtomicDbEngine", () => {
  it("offers the move-notation layout in engine settings", () => {
    const onToggleNotation = vi.fn();
    render(
      <AtomicDbEngineControls
        fen={STARTING_FEN}
        analysis={{ status: "idle", error: "", result: null, principalVariations: {} }}
        settings={{ enabled: true, lineCount: 1, showFollowUpMoves: true }}
        setSettings={vi.fn()}
        onDisable={vi.fn()}
        notationInline
        onToggleNotation={onToggleNotation}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Engine settings" }));
    const notationButton = screen.getByRole("button", { name: /Move notation/ });
    expect(within(notationButton).getByText("Inline")).toBeVisible();
    fireEvent.click(notationButton);
    expect(onToggleNotation).toHaveBeenCalledOnce();
  });

  it("links the AtomicDB source label to the current database position", () => {
    const position = parseAtomicDbResponse({
      key: "atomic-position-key",
      status: "UNKNOWN",
      score: 1100,
      best_move: "g1f3",
      moves: [{ uci: "g1f3", status: "UNKNOWN", score: 1100 }],
    });

    render(
      <AtomicDbEngineControls
        fen={STARTING_FEN}
        analysis={{
          status: "ready",
          error: "",
          source: "atomicdb",
          result: { fen: STARTING_FEN, position },
          principalVariations: {},
        }}
        settings={{ enabled: true, lineCount: 1, showFollowUpMoves: true }}
        setSettings={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Open this position on AtomicDB" })).toHaveAttribute(
      "href",
      "https://belzedar.duckdns.org/atomicdb/explore/atomic-position-key/",
    );
  });

  it("shows an evaluation instead of a game result for a non-terminal solved position", () => {
    const position = parseAtomicDbResponse({
      status: "WHITE_WIN",
      best_move: "g1f3",
      moves: [{ uci: "g1f3", status: "WHITE_WIN", mate: 4 }],
    });
    const analysis: AtomicDbAnalysisState = {
      status: "ready",
      error: "",
      source: "atomicdb",
      result: { fen: STARTING_FEN, position },
      principalVariations: {},
    };

    render(
      <>
        <AtomicDbEngineControls
          fen={STARTING_FEN}
          analysis={analysis}
          settings={{ enabled: true, lineCount: 1, showFollowUpMoves: true }}
          setSettings={vi.fn()}
          onDisable={vi.fn()}
        />
        <AtomicDbEvalBar fen={STARTING_FEN} analysis={analysis} enabled orientation="white" />
      </>,
    );

    expect(screen.queryByText("1–0")).not.toBeInTheDocument();
    expect(screen.getByText("#4")).toBeVisible();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "AtomicDB evaluation #4");
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

    render(
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
    expect(screen.getByText("Final position")).toBeVisible();
    expect(screen.getByText("Game over — White wins.")).toBeVisible();
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
