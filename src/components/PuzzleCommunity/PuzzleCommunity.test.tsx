import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommunityDiscussion, PuzzleCommunity } from "./PuzzleCommunity";

const mocks = vi.hoisted(() => ({
  fetchCommunityDiscussion: vi.fn(),
  fetchPuzzleCommunity: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
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
    render(
      <CommunityDiscussion target={{ type: "profile", id: "alice" }} heading="Comments on Alice" />,
    );

    expect(await screen.findByRole("heading", { name: "Comments on Alice" })).toBeVisible();
    expect(mocks.fetchCommunityDiscussion).toHaveBeenCalledWith({
      type: "profile",
      id: "alice",
      context: "",
    });
    expect(screen.queryByRole("group", { name: "Vote on this puzzle" })).not.toBeInTheDocument();
  });

  it("loads the shared discussion UI for a tournament target", async () => {
    render(
      <CommunityDiscussion
        target={{ type: "tournament", id: "ahc2026" }}
        heading="AHC 2026 discussion"
      />,
    );

    expect(await screen.findByRole("heading", { name: "AHC 2026 discussion" })).toBeVisible();
    expect(mocks.fetchCommunityDiscussion).toHaveBeenCalledWith({
      type: "tournament",
      id: "ahc2026",
      context: "",
    });
  });
});
