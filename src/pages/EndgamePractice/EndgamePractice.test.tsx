import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { ChessboardState } from "../../types/chessboard";
import { EndgamePracticePage } from "./EndgamePractice";

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({ mode: "pawn-duel" }),
  useNavigate: () => vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  leaderboard: vi.fn().mockResolvedValue({ entries: [], ownBest: null }),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { username: "player" } }) }));
vi.mock("../../components/Seo/Seo", () => ({ Seo: () => null }));
vi.mock("../../components/PuzzleCommunity/PuzzleCommunity", () => ({
  CommunityDiscussion: () => null,
}));
vi.mock("../../lib/endgamePractice/endgameLeaderboard", () => ({
  updateEndgameLeaderboard: mocks.leaderboard,
}));
vi.mock("../../lib/practice/fairyStockfish", () => ({
  analyzeFairyStockfishPosition: vi
    .fn()
    .mockResolvedValue([{ multipv: 1, depth: 20, scoreType: "mate", score: 10 }]),
  findFairyStockfishMove: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../lib/endgamePractice/tablebaseDefense", () => ({
  probeAtomicTablebase: vi.fn().mockResolvedValue({ moves: [] }),
  probeEndgameTablebase: vi.fn().mockResolvedValue(null),
  chooseEqualTablebaseDefense: () => null,
}));
vi.mock("../../components/Chessboard/Chessboard", () => ({
  Chessboard: ({
    fen,
    disabled,
    onStateChange,
  }: {
    fen: string;
    disabled: boolean;
    onStateChange: (state: ChessboardState) => void;
  }) => {
    const [finished, setFinished] = useState(false);
    return (
      <>
        <output aria-label="Board position">{fen}</output>
        <button
          disabled={disabled || finished}
          onClick={() => {
            setFinished(true);
            onStateChange({
              fen,
              turn: "black",
              winner: "white",
              lineMoves: [],
            } as unknown as ChessboardState);
          }}
        >
          Finish endgame
        </button>
      </>
    );
  },
}));

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

it("retries the exact position after wins or failures without recording times, then restores scoring for a new position", async () => {
  render(<EndgamePracticePage />);
  fireEvent.click(screen.getByRole("button", { name: "Start round" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Finish endgame" })).toBeEnabled());
  const initialFen = screen.getByLabelText("Board position").textContent;
  const recordCalls = () =>
    mocks.leaderboard.mock.calls.filter(([input]) => input.action === "record");

  fireEvent.click(screen.getByRole("button", { name: "Finish endgame" }));
  await waitFor(() => expect(recordCalls()).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByLabelText("Board position")).toHaveTextContent(initialFen!);
  expect(screen.getByRole("button", { name: "Finish endgame" })).toBeEnabled();
  expect(screen.getByText("Retry: this time won’t be submitted to the leaderboard.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Give up" }));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByLabelText("Board position")).toHaveTextContent(initialFen!);
  fireEvent.click(screen.getByRole("button", { name: "Finish endgame" }));
  await screen.findByRole("button", { name: "Next position" });
  expect(recordCalls()).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Next position" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Finish endgame" })).toBeEnabled());
  expect(screen.queryByText(/won’t be submitted/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Finish endgame" }));
  await waitFor(() => expect(recordCalls()).toHaveLength(2));
});
