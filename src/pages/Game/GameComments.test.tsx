import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArchiveGame } from "../../lib/archive/games";
import { buildAliasesLookup } from "../../lib/users/aliasesLookup";
import { aliasQueryKeys } from "../../lib/users/aliasQueries";
import { playerNameQueryKeys } from "../../lib/users/playerNameQueries";
import { GameComments } from "./GameComments";

vi.mock("./useGameTournament", () => ({ useGameTournament: () => ({ isTournament: true }) }));
vi.mock("../../components/PlayerLink/PlayerLink", () => ({
  PlayerLink: ({ username, children }: { username: string; children: string }) => (
    <a href={`/@/${username}`}>{children}</a>
  ),
}));

const setup = (
  messages: Array<{ username: string; text: string }>,
  nicknames: Array<{ username: string; nickname: string }> = [],
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    aliasQueryKeys.lookup(),
    buildAliasesLookup([
      {
        username: "wolfram_ep",
        aliases: ["grevozin"],
        accounts: [],
        openings: [],
        banned: false,
        bot: false,
      },
      {
        username: "howlind",
        aliases: ["aolynde"],
        accounts: [],
        openings: [],
        banned: false,
        bot: false,
      },
      {
        username: "leon_synthesis",
        aliases: ["leon_de_professional"],
        accounts: [],
        openings: [],
        banned: false,
        bot: false,
      },
    ]),
  );
  client.setQueryData(
    playerNameQueryKeys.nicknames,
    nicknames.map((row) => ({ ...row, is_primary: true })),
  );
  render(
    <QueryClientProvider client={client}>
      <GameComments game={{ spectator_chat: messages } as ArchiveGame} />
    </QueryClientProvider>,
  );
  return client;
};

describe("spectator chat player names", () => {
  beforeEach(() => window.localStorage.clear());

  it("resolves aliases before nickname lookup and links to the canonical profile without rewriting messages", () => {
    setup(
      [
        { username: "GreVoZin", text: "@maxwellssilvrhammer nice move" },
        { username: "leon_de_professional", text: "well played" },
        { username: "New_Player", text: "gg" },
      ],
      [{ username: "wolfram_ep", nickname: "wolfram" }],
    );

    expect(screen.getByRole("link", { name: "wolfram" })).toHaveAttribute("href", "/@/wolfram_ep");
    expect(screen.getByRole("link", { name: "leon_synthesis" })).toHaveAttribute(
      "href",
      "/@/leon_synthesis",
    );
    expect(screen.getByRole("link", { name: "new_player" })).toHaveAttribute(
      "href",
      "/@/new_player",
    );
    expect(screen.getByText("@maxwellssilvrhammer nice move")).toBeVisible();
  });

  it("uses newly loaded Supabase nicknames for previously captured chats while retaining the profile identity", async () => {
    const client = setup([{ username: "aolynde", text: "thanks" }]);
    expect(screen.getByRole("link", { name: "howlind" })).toHaveAttribute("href", "/@/howlind");
    act(() => {
      client.setQueryData(playerNameQueryKeys.nicknames, [
        { username: "howlind", nickname: "howlin", is_primary: true },
      ]);
    });
    expect(await screen.findByRole("link", { name: "howlin" })).toHaveAttribute(
      "href",
      "/@/howlind",
    );
  });
});
