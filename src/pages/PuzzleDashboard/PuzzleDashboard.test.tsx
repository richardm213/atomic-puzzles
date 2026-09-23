import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { puzzleQueryKeys } from "../../lib/puzzles/puzzleQueries";
import { userQueryKeys } from "../../lib/users/userQueries";
import { PuzzleDashboardPage } from "./PuzzleDashboard";

const authState = vi.hoisted(() => ({ username: "alice" }));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { username: authState.username },
  }),
}));
vi.mock("../../components/Seo/Seo", () => ({ Seo: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#puzzle">{children}</a>,
}));
vi.mock("../../lib/puzzles/customPuzzleSets", () => ({
  fetchCustomPuzzleSetAttempts: vi.fn(async () => []),
  listCustomPuzzleSets: vi.fn(async () => []),
}));

let client: QueryClient;

const puzzles = [
  {
    id: 10,
    puzzleId: 10,
    author: "alice",
    event: "Atomic Arena",
    tags: ["fork"],
    fen: "",
    solution: "",
    explanation: "",
  },
  {
    id: 11,
    puzzleId: 11,
    author: "bob",
    event: "Atomic Arena",
    tags: ["pin"],
    fen: "",
    solution: "",
    explanation: "",
  },
];

const progress = [
  {
    puzzle_id: "10",
    first_attempt_at: "2026-09-20T12:00:00.000Z",
    puzzle_correct: true,
    incorrect_move: null,
    correct_move: "e2e4",
  },
];

beforeEach(() => {
  localStorage.clear();
  authState.username = "alice";
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(puzzleQueryKeys.catalog, puzzles);
  client.setQueryData([...puzzleQueryKeys.progress, "user", "alice"], progress);
  client.setQueryData(userQueryKeys.registration("alice"), true);
});

afterEach(() => {
  cleanup();
  client.clear();
});

const renderDashboard = (username?: string) =>
  render(
    <QueryClientProvider client={client}>
      <PuzzleDashboardPage username={username} />
    </QueryClientProvider>,
  );

describe("puzzle dashboard views", () => {
  it("shows a tag-free list of puzzles created by the dashboard owner", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByLabelText("Puzzle tags")).toHaveTextContent("Fork");
    await user.click(screen.getByRole("tab", { name: "Puzzles created" }));

    const createdList = screen.getByRole("list", { name: "Puzzles created" });
    expect(within(createdList).getByRole("link", { name: "Puzzle 10" })).toBeInTheDocument();
    expect(within(createdList).queryByText("Puzzle 11")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Puzzle tags")).not.toBeVisible();
  });

  it("hides puzzle tags when viewing another player's attempts", async () => {
    authState.username = "bob";
    renderDashboard("alice");

    expect(await screen.findByRole("link", { name: "Puzzle 10" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Puzzle tags")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(screen.queryByLabelText("Search tags to add")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Puzzle, author, or event")).toBeInTheDocument();
  });
});
