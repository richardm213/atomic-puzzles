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
  editCommunityComment: vi.fn(),
  fetchCommunityDiscussion: vi.fn(),
  fetchPuzzleCommunity: vi.fn(),
  isAuthenticated: true,
  postCommunityComment: vi.fn(),
  saveCommunityCommentVote: vi.fn(),
  savePuzzleVote: vi.fn(),
  searchUsernameSuggestions: vi.fn(),
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
    editCommunityComment: mocks.editCommunityComment,
    fetchCommunityDiscussion: mocks.fetchCommunityDiscussion,
    fetchPuzzleCommunity: mocks.fetchPuzzleCommunity,
    postCommunityComment: mocks.postCommunityComment,
    saveCommunityCommentVote: mocks.saveCommunityCommentVote,
    savePuzzleVote: mocks.savePuzzleVote,
  };
});

vi.mock("../../lib/users/usernameSearch", () => ({
  searchUsernameSuggestions: mocks.searchUsernameSuggestions,
}));

vi.mock("../PlayerLink/PlayerLink", () => ({
  PlayerLink: ({ children, username }: { children: string; username: string }) => (
    <a href={`/@/${username}`}>{children}</a>
  ),
}));

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
    mocks.postCommunityComment.mockReset();
    mocks.editCommunityComment.mockReset();
    mocks.saveCommunityCommentVote.mockReset();
    mocks.savePuzzleVote.mockReset();
    mocks.searchUsernameSuggestions.mockResolvedValue([
      {
        username: "seaside_tiramisu",
        matchedName: "seaside_tiramisu",
        matchType: "username",
        banned: false,
        accountUsername: "seaside_tiramisu",
      },
    ]);
  });

  it("renders Markdown and legacy links without interpreting unsafe links or HTML", async () => {
    mocks.fetchCommunityDiscussion.mockResolvedValueOnce({
      comments: [
        {
          id: 9,
          username: "alice",
          parent_id: null,
          body: "**Seeds:** [this table](https://example.com/table)\nhttps://example.com/legacy\n@Bob `@code` [bad](javascript:alert(1)) <img src=x onerror=alert(1)>",
          created_at: "2026-01-01T00:00:00Z",
          upvotes: 0,
          downvotes: 0,
          score: 0,
          viewer_vote: 0,
        },
      ],
    });
    render(<CommunityDiscussion target={{ type: "tournament", id: "awc2026" }} />);
    const comment = within(await screen.findByRole("article"));
    expect(comment.getByRole("link", { name: "this table" })).toHaveAttribute(
      "href",
      "https://example.com/table",
    );
    expect(comment.getByRole("link", { name: "https://example.com/legacy" })).toHaveAttribute(
      "href",
      "https://example.com/legacy",
    );
    expect(comment.getByRole("link", { name: "@Bob" })).toHaveAttribute("href", "/@/bob");
    expect(comment.queryByRole("link", { name: /bad|@code/ })).not.toBeInTheDocument();
    expect(comment.queryByRole("img")).not.toBeInTheDocument();
    expect(comment.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("opens the author's original Markdown and saves edits without losing the raw source", async () => {
    const user = userEvent.setup();
    const target = { type: "tournament" as const, id: "awc2026" };
    const original = "[this table](https://example.com/table)";
    const next = "[updated table](https://example.com/table)";
    const comment = {
      id: 9,
      username: "viewer",
      parent_id: null,
      body: original,
      created_at: "2026-01-01T00:00:00Z",
      upvotes: 0,
      downvotes: 0,
      score: 0,
      viewer_vote: 0,
    };
    mocks.fetchCommunityDiscussion.mockResolvedValueOnce({ comments: [comment] });
    mocks.editCommunityComment.mockImplementationOnce(async () => {
      mocks.fetchCommunityDiscussion.mockResolvedValueOnce({
        comments: [{ ...comment, body: next }],
      });
      return { id: 9, body: next };
    });
    render(<CommunityDiscussion target={target} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByRole("textbox", { name: "Edit comment (Markdown)" });
    expect(editor).toHaveValue(original);
    expect(editor).toHaveFocus();
    await user.clear(editor);
    await user.paste(next);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mocks.editCommunityComment).toHaveBeenCalledWith({ ...target, context: "" }, 9, next);
    expect(await screen.findByRole("link", { name: "updated table" })).toBeInTheDocument();
  });

  it("shows puzzle vote feedback before the save request finishes", async () => {
    const user = userEvent.setup();
    let finishSave!: (value: unknown) => void;
    mocks.savePuzzleVote.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );

    render(
      <>
        <div id="vote-slot" />
        <PuzzleCommunity puzzleId={42} voteTargetId="vote-slot" />
      </>,
    );

    const upvote = await screen.findByRole("button", {
      name: "Upvote this puzzle. 0 upvotes",
    });
    await user.click(upvote);

    expect(
      await screen.findByRole("button", { name: "Upvote this puzzle. 1 upvotes" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.savePuzzleVote).toHaveBeenCalledWith(42, 1);
    finishSave({
      counts: { puzzle_id: 42, upvotes: 1, downvotes: 0, score: 1 },
      comments: [],
      viewerVote: 1,
    });
    await waitFor(() => expect(upvote).not.toBeDisabled());
  });

  it("shows a changed puzzle downvote before the save request finishes", async () => {
    const user = userEvent.setup();
    mocks.fetchPuzzleCommunity.mockResolvedValue({
      counts: { puzzle_id: 42, upvotes: 3, downvotes: 2, score: 1 },
      comments: [],
      viewerVote: 1,
    });
    let finishSave!: (value: unknown) => void;
    mocks.savePuzzleVote.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );

    render(
      <>
        <div id="vote-slot" />
        <PuzzleCommunity puzzleId={42} voteTargetId="vote-slot" />
      </>,
    );

    const downvote = await screen.findByRole("button", {
      name: "Downvote this puzzle. 2 downvotes",
    });
    await user.click(downvote);

    expect(
      await screen.findByRole("button", { name: "Downvote this puzzle. 3 downvotes" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Upvote this puzzle. 2 upvotes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    finishSave({
      counts: { puzzle_id: 42, upvotes: 2, downvotes: 3, score: -1 },
      comments: [],
      viewerVote: -1,
    });
    await waitFor(() => expect(downvote).not.toBeDisabled());
  });

  it("shows comment vote feedback before the save request finishes", async () => {
    const user = userEvent.setup();
    let finishSave!: (value: unknown) => void;
    mocks.saveCommunityCommentVote.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );

    render(<PuzzleCommunity puzzleId={42} voteTargetId="missing-slot" />);

    const upvote = await screen.findByRole("button", { name: "Upvote comment. 1 upvotes" });
    await user.click(upvote);

    expect(
      await screen.findByRole("button", { name: "Upvote comment. 2 upvotes" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.saveCommunityCommentVote).toHaveBeenCalledWith(
      { type: "puzzle", id: "42", context: "" },
      7,
      1,
    );
    finishSave({
      counts: { puzzle_id: 42, upvotes: 0, downvotes: 0, score: 0 },
      comments: [
        {
          id: 7,
          puzzle_id: 42,
          username: "alice",
          parent_id: null,
          body: "Interesting position",
          created_at: "2026-01-01T00:00:00Z",
          upvotes: 2,
          downvotes: 0,
          score: 2,
          viewer_vote: 1,
        },
      ],
      viewerVote: 0,
    });
    await waitFor(() => expect(upvote).not.toBeDisabled());
  });

  it("shows a posted comment before the save request finishes", async () => {
    const user = userEvent.setup();
    let finishSave!: (value: unknown) => void;
    mocks.postCommunityComment.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );

    render(<PuzzleCommunity puzzleId={42} voteTargetId="missing-slot" />);

    const composer = await screen.findByRole("textbox", { name: "Add a comment" });
    await user.type(composer, "Fast feedback");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(await screen.findByText("Fast feedback")).toBeVisible();
    expect(composer).toHaveValue("");
    expect(mocks.postCommunityComment).toHaveBeenCalledWith(
      { type: "puzzle", id: "42", context: "" },
      "Fast feedback",
      null,
    );
    finishSave({
      counts: { puzzle_id: 42, upvotes: 0, downvotes: 0, score: 0 },
      comments: [
        {
          id: 8,
          puzzle_id: 42,
          username: "viewer",
          parent_id: null,
          body: "Fast feedback",
          created_at: "2026-11-02T04:45:00Z",
          upvotes: 1,
          downvotes: 0,
          score: 1,
          viewer_vote: 1,
        },
      ],
      viewerVote: 0,
    });
    await screen.findByRole("button", { name: "Post comment" });
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

  it("shows a discussion error without also claiming there are no comments", async () => {
    mocks.fetchCommunityDiscussion.mockRejectedValue(new Error("Unable to load discussion."));

    render(<CommunityDiscussion target={{ type: "profile", id: "opabinia" }} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load discussion.");
    expect(screen.queryByText("No comments yet.")).not.toBeInTheDocument();
  });

  it("sorts tournament comments by recent by default and top on request", async () => {
    const user = userEvent.setup();
    mocks.fetchCommunityDiscussion.mockResolvedValue({
      comments: [
        {
          id: 1,
          username: "alice",
          parent_id: null,
          body: "Older top comment",
          created_at: "2026-01-01T00:00:00Z",
          upvotes: 8,
          downvotes: 0,
          score: 8,
          viewer_vote: 0,
        },
        {
          id: 2,
          username: "bob",
          parent_id: null,
          body: "Newest comment",
          created_at: "2026-02-01T00:00:00Z",
          upvotes: 0,
          downvotes: 0,
          score: 0,
          viewer_vote: 0,
        },
      ],
    });

    render(<CommunityDiscussion target={{ type: "tournament", id: "awc2026" }} />);

    expect(await screen.findByRole("button", { name: "Recent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Newest comment");

    await user.click(screen.getByRole("button", { name: "Top" }));

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Older top comment");
  });

  it("collapses only the selected branch and keeps nested disclosure state and keyboard focus", async () => {
    const user = userEvent.setup();
    const comment = (id: number, username: string, parent_id: number | null, body: string) => ({
      id,
      username,
      parent_id,
      body,
      created_at: "2026-01-01T00:00:00Z",
      upvotes: 0,
      downvotes: 0,
      score: 0,
      viewer_vote: 0,
    });
    mocks.fetchCommunityDiscussion.mockResolvedValueOnce({
      comments: [
        comment(1, "alice", null, "First thread"),
        comment(2, "bob", 1, "Nested reply"),
        comment(3, "charlie", 2, "Deep reply"),
        comment(4, "dana", null, "Separate thread"),
      ],
    });
    render(<CommunityDiscussion target={{ type: "tournament", id: "awc2026" }} />);

    await user.click(await screen.findByRole("button", { name: "Collapse thread by bob" }));
    const parentToggle = screen.getByRole("button", { name: "Collapse thread by alice" });
    parentToggle.focus();
    await user.keyboard("{Enter}");

    expect(parentToggle).toHaveAccessibleName("Expand thread by alice");
    expect(parentToggle).toHaveAttribute("aria-expanded", "false");
    expect(parentToggle).toHaveFocus();
    expect(screen.getByText("2 replies hidden")).toBeVisible();
    expect(screen.getByText("First thread")).not.toBeVisible();
    expect(screen.queryByText("Nested reply")).not.toBeInTheDocument();
    expect(screen.getByText("Separate thread")).toBeVisible();

    await user.keyboard(" ");
    expect(parentToggle).toHaveAttribute("aria-expanded", "true");
    expect(parentToggle).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Expand thread by bob" }));
    expect(screen.getByText("Deep reply")).toBeVisible();
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

  it("suggests matching registered users and inserts a mention", async () => {
    const user = userEvent.setup();
    render(<CommunityDiscussion target={{ type: "match", id: "match-1", context: "blitz" }} />);

    const input = await screen.findByRole("textbox", { name: "Add a comment" });
    await user.type(input, "Thanks @sea");

    const suggestion = await screen.findByRole("option", { name: "@seaside_tiramisu" });
    await user.click(within(suggestion).getByRole("button"));

    expect(input).toHaveValue("Thanks @seaside_tiramisu ");
  });
});
