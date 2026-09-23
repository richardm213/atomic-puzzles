import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as testingLibraryRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommunityDiscussion, PuzzleCommunity } from "./PuzzleCommunity";

const render = (element: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return testingLibraryRender(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
};

const mocks = vi.hoisted(() => ({
  fetchCommunityDiscussion: vi.fn(),
  fetchPuzzleCommunity: vi.fn(),
  isAuthenticated: true,
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: mocks.isAuthenticated,
    login: vi.fn(),
    user: { username: "viewer" },
  }),
}));

vi.mock("../../lib/community/puzzleCommunity", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/community/puzzleCommunity")>();
  return {
    ...original,
    fetchCommunityDiscussion: mocks.fetchCommunityDiscussion,
    fetchPuzzleCommunity: mocks.fetchPuzzleCommunity,
  };
});

describe("PuzzleCommunity", () => {
  beforeEach(() => {
    mocks.isAuthenticated = true;
    mocks.fetchCommunityDiscussion.mockResolvedValue({ comments: [] });
    mocks.fetchPuzzleCommunity.mockResolvedValue({
      counts: { puzzle_id: 42, upvotes: 0, downvotes: 0, score: 0 },
      comments: [
        {
          id: 7,
          puzzle_id: 42,
          username: "alice",
          parent_id: null,
          body: "Interesting position",
          created_at: "2026-01-01T00:00:00Z",
          upvotes: 1,
          downvotes: 0,
          score: 1,
          viewer_vote: 0,
        },
      ],
      viewerVote: 0,
    });
  });

  it("shows only the login action and empty state when signed out with no comments", async () => {
    mocks.isAuthenticated = false;

    render(<CommunityDiscussion target={{ type: "match", id: "match-1" }} />);

    expect(
      await screen.findByRole("button", { name: "Log in with Lichess to comment" }),
    ).toBeVisible();
    expect(await screen.findByText("No comments yet.")).toBeVisible();
    expect(screen.queryByText("Join the discussion")).not.toBeInTheDocument();
    expect(screen.queryByText(/start the conversation/i)).not.toBeInTheDocument();
  });

  it("moves the composer directly under the comment being replied to", async () => {
    const user = userEvent.setup();
    render(<PuzzleCommunity puzzleId={42} voteTargetId="missing-vote-target" />);

    const comment = await screen.findByText("Interesting position");
    const commentItem = comment.closest("li");
    expect(commentItem).not.toBeNull();

    await user.click(within(commentItem!).getByRole("button", { name: "Reply" }));

    const replyInput = screen.getByRole("textbox", { name: "Reply to alice" });
    expect(commentItem).toContainElement(replyInput);
    expect(replyInput).toHaveFocus();

    await user.click(within(commentItem!).getByRole("button", { name: "Cancel reply" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Add a comment" }).closest("li")).toBeNull();
    });
  });

  it("loads the same threaded discussion UI for a profile target", async () => {
    render(<CommunityDiscussion target={{ type: "profile", id: "alice" }} />);

    expect(await screen.findByRole("region", { name: "Comments" })).toBeVisible();
    expect(mocks.fetchCommunityDiscussion).toHaveBeenCalledWith({
      type: "profile",
      id: "alice",
      context: "",
    });
    expect(screen.queryByRole("group", { name: "Vote on this puzzle" })).not.toBeInTheDocument();
  });

  it("loads the shared discussion UI for a tournament target", async () => {
    render(<CommunityDiscussion target={{ type: "tournament", id: "ahc2026" }} />);

    expect(await screen.findByRole("region", { name: "Comments" })).toBeVisible();
    expect(mocks.fetchCommunityDiscussion).toHaveBeenCalledWith({
      type: "tournament",
      id: "ahc2026",
      context: "",
    });
  });
});
