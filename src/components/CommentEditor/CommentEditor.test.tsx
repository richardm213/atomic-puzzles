import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";
import { CommentEditor } from "./CommentEditor";

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../../lib/users/usernameSearch", () => ({ searchUsernameSuggestions: search }));

const suggestion = (
  name: string,
  accountUsername: string | null = null,
): UsernameSearchSuggestion => ({
  username: name,
  matchedName: name,
  accountUsername,
  matchType: "username",
  banned: false,
  hasAtomicTourPoints: false,
});
const moveCaret = (editor: HTMLElement, offset: number) => {
  const text = editor.querySelector("p")?.firstChild;
  if (!text) throw new Error("The editor has no text");
  const selection = window.getSelection();
  const range = new Range();
  range.setStart(text, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent(document, new Event("selectionchange"));
};

const Editor = ({
  initial = "",
  maxLength,
  onChange,
}: {
  initial?: string;
  maxLength?: number;
  onChange?: (value: string) => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <CommentEditor
      aria-label="Comment"
      value={value}
      {...(maxLength === undefined ? {} : { maxLength })}
      onValueChange={(value) => {
        setValue(value);
        onChange?.(value);
      }}
    />
  );
};

describe("CommentEditor", () => {
  beforeEach(() => search.mockReset());

  it("turns a completed typed emote into an image while preserving its source and literal code", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Editor onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    await user.type(input, "Nice :kekwbrug:!");
    expect(screen.getByRole("img", { name: "kekwbrug" })).toBeVisible();
    expect(onChange).toHaveBeenLastCalledWith("Nice :kekwbrug:!");
    await user.keyboard("{Enter}");
    await user.keyboard("`:kekwbrug:`");
    expect(screen.getAllByRole("img", { name: "kekwbrug" })).toHaveLength(1);
    expect(input.textContent).toContain("`:kekwbrug:`");
  });

  it("enforces the configured source length without blocking deletion", async () => {
    const user = userEvent.setup();
    render(<Editor initial="12345" maxLength={5} />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    await user.click(input);
    moveCaret(input, 5);
    await user.keyboard("6");
    expect(input.textContent).toBe("12345");
    await user.keyboard("{Backspace}");
    expect(input.textContent).toBe("1234");
  });

  it("waits for three mention characters and replaces the full name at the caret using the keyboard", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([
      suggestion("seasidecliff", "seaside_tiramisu"),
      suggestion("seaside_tiramisu", "seaside_tiramisu"),
      suggestion("sean"),
    ]);
    render(<Editor initial="Ask @seaside later" />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    await user.click(input);
    // Editing an existing mention must replace the suffix as well as the typed prefix.
    moveCaret(input, 7);
    fireEvent.click(input);
    expect(search).not.toHaveBeenCalled();
    moveCaret(input, 8);
    fireEvent.click(input);
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    await user.keyboard("{Enter}");
    expect(input.textContent).toBe("Ask @seaside_tiramisu later");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    await waitFor(() => expect(window.getSelection()?.anchorOffset).toBe(21));
  });

  it("discards stale requests and dismisses suggestions on Escape or loss of focus", async () => {
    const user = userEvent.setup();
    let resolveOld!: (value: UsernameSearchSuggestion[]) => void;
    search.mockReturnValueOnce(
      new Promise<UsernameSearchSuggestion[]>((resolve) => {
        resolveOld = resolve;
      }),
    );
    search.mockResolvedValue([suggestion("rechesster", "rechesster")]);
    render(
      <>
        <Editor />
        <button>Elsewhere</button>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Comment" });
    await user.type(input, "@sea");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await user.clear(input);
    await user.type(input, "@rec");
    await screen.findByRole("option", { name: "@rechesster" });
    resolveOld([suggestion("seaside_tiramisu")]);
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: "@seaside_tiramisu" })).not.toBeInTheDocument(),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    moveCaret(input, 4);
    fireEvent.click(input);
    await screen.findByRole("option", { name: "@rechesster" });
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("suggests players without puzzle accounts and keeps emails and normal text untouched", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([suggestion("new_player")]);
    render(<Editor />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    await user.type(input, "mail@example.com ");
    expect(search).not.toHaveBeenCalled();
    await user.keyboard("@new");
    await user.click(await screen.findByRole("option", { name: "@new_player" }));
    expect(input.textContent).toBe("mail@example.com @new_player ");
  });

  it("replaces the complete shortcode at the caret and accepts Tab without searching for users", async () => {
    const user = userEvent.setup();
    render(<Editor initial="Nice :kekwrong: move" />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    await user.click(input);
    moveCaret(input, 10);
    fireEvent.click(input);
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveAccessibleName(":kekw:");
    await user.keyboard("{Tab}");
    expect(input.textContent).toBe("Nice  move");
    expect(screen.getByRole("img", { name: "kekw" })).toBeVisible();
    expect(search).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it("lists custom emotes first and inserts native emoji from picker search", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const input = screen.getByRole("textbox", { name: "Comment" });
    await user.type(input, "Good move ");
    await user.click(screen.getByRole("button", { name: "Choose an emote" }));
    expect(screen.getByRole("button", { name: ":kekw:" })).toBeVisible();
    expect(screen.getByRole("button", { name: ":atomic-ruby:" })).toBeVisible();
    const searchInput = screen.getByRole("searchbox", { name: "Search emotes" });
    expect(searchInput).toHaveFocus();
    await user.type(searchInput, "rofl");
    const emoji = await screen.findByRole("button", { name: ":rofl:" });
    // Some browsers blur the search input without reporting the clicked option as relatedTarget.
    fireEvent.blur(searchInput, { relatedTarget: null });
    await user.click(emoji);
    expect(input.textContent).toBe("Good move 🤣 ");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
