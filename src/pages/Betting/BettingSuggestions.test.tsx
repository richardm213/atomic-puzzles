import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BettingSuggestions } from "./BettingSuggestions";

const mocks = vi.hoisted(() => ({
  fetchMarketSuggestions: vi.fn(),
  voteOnMarketSuggestion: vi.fn(),
}));

vi.mock("../../components/PlayerLink/PlayerLink", () => ({
  PlayerLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("../../lib/betting/betting", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/betting/betting")>();
  return {
    ...original,
    fetchMarketSuggestions: mocks.fetchMarketSuggestions,
    voteOnMarketSuggestion: mocks.voteOnMarketSuggestion,
  };
});

describe("BettingSuggestions", () => {
  beforeEach(() => {
    mocks.fetchMarketSuggestions.mockResolvedValue([
      {
        id: 12,
        username: "alice",
        question: "Will Alice win the next shield?",
        outcomes: [
          { label: "Yes", odds: 60 },
          { label: "No", odds: 40 },
        ],
        score: 0,
        upvotes: 0,
        downvotes: 0,
        userVote: 0,
        createdAt: "2026-11-01T00:00:00Z",
      },
    ]);
    mocks.voteOnMarketSuggestion.mockReset();
  });

  it("shows suggestion vote feedback before the save request finishes", async () => {
    const user = userEvent.setup();
    let finishSave!: (value: unknown) => void;
    mocks.voteOnMarketSuggestion.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BettingSuggestions isAuthenticated authLoading={false} onLogin={() => undefined} />
      </QueryClientProvider>,
    );

    const upvote = await screen.findByRole("button", { name: "Upvote suggestion by alice" });
    expect(upvote).toHaveTextContent("0");
    await user.click(upvote);

    expect(upvote).toHaveTextContent("1");
    expect(upvote).toHaveAttribute("aria-pressed", "true");

    finishSave({ suggestionId: 12, userVote: 1 });
    await waitFor(() => expect(upvote).not.toBeDisabled());
  });
});
