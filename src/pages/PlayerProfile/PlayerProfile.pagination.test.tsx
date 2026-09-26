import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createModeRecord } from "../../constants/matches";
import { AppSettingsProvider } from "../../context/AppSettings";
import { profileQueryKeys } from "../../features/profile/profileQueries";
import { aliasQueryKeys } from "../../lib/users/aliasQueries";
import { userQueryKeys } from "../../lib/users/userQueries";
import { PlayerProfilePage } from "./PlayerProfile";

const loadRawMatchesByMode = vi.hoisted(() => vi.fn());
vi.mock("../../lib/matches/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/matches/data")>()),
  loadRawMatchesByMode,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/Seo/Seo", () => ({ Seo: () => null }));

let client: QueryClient;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  loadRawMatchesByMode.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(aliasQueryKeys.identity("alice"), null);
  client.setQueryData(
    profileQueryKeys.ratingsSnapshot("alice"),
    createModeRecord(() => new Map()),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

const renderProfile = ({ historyOnly = true }: { historyOnly?: boolean } = {}) =>
  render(
    <AppSettingsProvider>
      <QueryClientProvider client={client}>
        <PlayerProfilePage username="alice" historyOnly={historyOnly} />
      </QueryClientProvider>
    </AppSettingsProvider>,
  );

describe("banned profile ratings", () => {
  it("still shows an available Wolfrandom rating", async () => {
    client.setQueryData(aliasQueryKeys.identity("alice"), {
      username: "alice",
      banned: true,
      accounts: [],
    });
    const ratings = createModeRecord(() => new Map());
    ratings.wolfrandom.set("alice", {
      currentRating: 2140,
      peakRating: 2195,
      peakDate: "2026-09-18",
      currentRd: 52,
      gamesPlayed: 31,
      rank: 4,
      topWins: [],
    });
    client.setQueryData(profileQueryKeys.ratingsSnapshot("alice"), ratings);
    client.setQueryData(profileQueryKeys.monthRanks("alice"), []);
    client.setQueryData(["profile", "alice", "tournament-trophies"], []);
    client.setQueryData(userQueryKeys.aliasRegistration(["alice"]), null);
    loadRawMatchesByMode.mockResolvedValue({ matches: [], total: 0 });

    renderProfile({ historyOnly: false });

    const wolfrandomRatings = await screen.findByRole("region", {
      name: "Wolfrandom ratings",
    });
    expect(within(wolfrandomRatings).getByText("2140")).toBeInTheDocument();
    expect(within(wolfrandomRatings).getByText("31")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Blitz ratings" })).not.toBeInTheDocument();
    expect(screen.getByText(/Wolfrandom rating is still shown below/)).toBeInTheDocument();
  });
});

describe("profile match pagination", () => {
  it("keeps an uncached next page selected while loading, then supports Previous", async () => {
    let resolvePage!: (result: { matches: never[]; total: number }) => void;
    loadRawMatchesByMode.mockImplementation((_mode, { page }) =>
      page === 1
        ? Promise.resolve({ matches: [], total: 75 })
        : new Promise((resolve) => {
            resolvePage = resolve;
          }),
    );
    renderProfile();
    await screen.findByText("Page 1 / 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(loadRawMatchesByMode).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ page: 2 }),
      ),
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await act(async () => resolvePage({ matches: [], total: 75 }));
    await screen.findByText("Page 2 / 3");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Page 1 / 3");
  });

  it("clamps a page when the loaded total really shrinks", async () => {
    loadRawMatchesByMode.mockImplementation(async (_mode, { page }) => ({
      matches: [],
      total: page === 1 ? 75 : 25,
    }));
    renderProfile();
    await screen.findByText("Page 1 / 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(loadRawMatchesByMode).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ page: 2 }),
      ),
    );
    await screen.findByText("Page 1 / 3");
  });
});

describe("unrated match history", () => {
  const ratings = { before_rating: null, after_rating: null, before_rd: null, after_rd: null };
  beforeEach(() => {
    window.history.replaceState(null, "", "/@/alice");
    loadRawMatchesByMode.mockResolvedValue({
      total: 1,
      matches: [
        {
          match_id: "unrated-match",
          players: ["alice", "bob"],
          start_ts: 1700000000000,
          time_control: "3+0",
          source: "arena",
          games: [{ id: "game1234", white: "alice", black: "bob", winner: "white" }],
          ratings: { alice: ratings, bob: ratings },
        },
      ],
    });
  });

  it.each([false, true])("shows unrated matches with banned=%s", async (banned) => {
    client.setQueryData(aliasQueryKeys.identity("alice"), {
      username: "alice",
      banned,
      accounts: [],
    });
    renderProfile();
    await screen.findByText("bob");
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[0]!).getAllByRole("columnheader")).toHaveLength(banned ? 5 : 7);
    const matchRow = table.querySelector("tbody tr")!;
    const cells = matchRow.querySelectorAll("td");
    expect(cells).toHaveLength(banned ? 5 : 7);
    if (!banned) {
      expect(cells[4]).toHaveTextContent("");
      expect(cells[5]).toHaveTextContent("");
      expect(cells[4]?.textContent).toBe("");
      expect(cells[5]?.textContent).toBe("");
    }
    fireEvent.click(matchRow);
    expect(await screen.findAllByText("Unrated")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "game1234" })).toHaveAttribute(
      "href",
      expect.stringContaining("game1234"),
    );
    expect(screen.queryByText(/NaN|Rating 0/)).not.toBeInTheDocument();
  });
});
