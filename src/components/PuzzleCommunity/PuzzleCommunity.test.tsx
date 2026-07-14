import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PuzzleCommunity } from "./PuzzleCommunity";

const mocks = vi.hoisted(() => ({
  fetchPuzzleCommunity: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "token",
    isAuthenticated: true,
    login: vi.fn(),
    user: { username: "viewer" },
  }),
}));

vi.mock("../../lib/community/puzzleCommunity", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/community/puzzleCommunity")>();
  return { ...original, fetchPuzzleCommunity: mocks.fetchPuzzleCommunity };
});

describe("PuzzleCommunity", () => {
  beforeEach(() => {
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
});
