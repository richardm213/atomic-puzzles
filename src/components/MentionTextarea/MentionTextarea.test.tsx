import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";
import { MentionTextarea } from "./MentionTextarea";

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
const Editor = ({ initial = "" }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return <MentionTextarea aria-label="Comment" value={value} onValueChange={setValue} />;
};

describe("MentionTextarea", () => {
  beforeEach(() => search.mockReset());

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
    (input as HTMLTextAreaElement).setSelectionRange(7, 7);
    fireEvent.click(input);
    expect(search).not.toHaveBeenCalled();
    (input as HTMLTextAreaElement).setSelectionRange(8, 8);
    fireEvent.click(input);
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Ask @seaside_tiramisu later");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    await waitFor(() => expect((input as HTMLTextAreaElement).selectionStart).toBe(21));
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
    await user.click(input);
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
    await user.type(input, "@new");
    await user.click(await screen.findByRole("option", { name: "@new_player" }));
    expect(input).toHaveValue("mail@example.com @new_player ");
  });
});
