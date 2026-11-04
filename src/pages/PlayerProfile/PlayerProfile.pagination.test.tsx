import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createModeRecord } from "../../constants/matches";
import { AppSettingsProvider } from "../../context/AppSettings";
import { profileQueryKeys } from "../../features/profile/profileQueries";
import { getProfileRankingMonthKey } from "../../features/profile/profileTrophies";
import { isoMonthStartFromMonthKey } from "../../lib/archive/leaderboard";
import type { ParsedMatch } from "../../lib/matches/data";
import { aliasQueryKeys } from "../../lib/users/aliasQueries";
import { userQueryKeys } from "../../lib/users/userQueries";
import { PlayerProfilePage } from "./PlayerProfile";

const loadRawMatchesByMode = vi.hoisted(() => vi.fn());

const match = (id: string, startTs: number): ParsedMatch => ({
  match_id: id,
  mode: "blitz",
  players: ["alice", "bob"],
  start_ts: startTs,
  time_control: "60+0",
  source: "lobby",
  tournament_id: null,
  games: [{ id: `${id}-game`, game_index: 1, winner: "white", white: "alice", black: "bob" }],
  ratings: {
    alice: { before_rating: 1800, after_rating: 1805, before_rd: 50, after_rd: 49 },
    bob: { before_rating: 1750, after_rating: 1745, before_rd: 50, after_rd: 49 },
  },
});
vi.mock("../../lib/matches/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/matches/data")>()),
  loadRawMatchesByMode,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
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

const renderProfile = ({
  historyOnly = true,
  username = "alice",
}: { historyOnly?: boolean; username?: string } = {}) =>
  render(
    <AppSettingsProvider>
      <QueryClientProvider client={client}>
        <PlayerProfilePage username={username} historyOnly={historyOnly} />
      </QueryClientProvider>
    </AppSettingsProvider>,
  );

describe("profile alias trophies", () => {
  it("shows canonical ranking trophies on an alternate profile alias", async () => {
    const rankingMonthLabel = getProfileRankingMonthKey(new Date());
    const rankingMonthValue = isoMonthStartFromMonthKey(rankingMonthLabel);
    const identity = {
      username: "alice",
      aliases: ["alice_alt"],
      openings: [],
      banned: false,
      accounts: [
        {
          alias: "alice_alt",
          displayAlias: "alice_alt",
          source: "lichess" as const,
          isCounted: true,
          banned: false,
        },
      ],
    };
    client.setQueryData(aliasQueryKeys.identity("alice_alt"), identity);
    client.setQueryData(profileQueryKeys.monthRanks("alice"), [
      {
        monthKey: rankingMonthLabel,
        monthValue: rankingMonthValue,
        monthDate: new Date(`${rankingMonthValue}T00:00:00Z`),
        monthLabel: rankingMonthLabel,
        mode: "blitz",
        rank: 1,
        rating: 2400,
        rd: 45,
        games: 20,
      },
    ]);
    client.setQueryData(["profile", "alice", "tournament-trophies", ["alice", "alice_alt"]], []);
    client.setQueryData(["puzzle-ranking-trophies"], []);
    client.setQueryData(userQueryKeys.aliasRegistration(["alice", "alice_alt"]), null);
    loadRawMatchesByMode.mockResolvedValue({ matches: [], total: 0 });

    renderProfile({ historyOnly: false, username: "alice_alt" });

    const trophies = await screen.findByLabelText("Atomic trophies");
    expect(within(trophies).getByText("Blitz")).toBeInTheDocument();
  });
});

describe("estimated player profiles", () => {
  it("shows a cheater's estimates without presenting a leaderboard rank", async () => {
    client.setQueryData(aliasQueryKeys.identity("alice"), {
      username: "alice",
      aliases: [],
      openings: [],
      banned: true,
      bot: false,
      accounts: [],
    });
    const ratings = createModeRecord(() => new Map());
    ratings.blitz.set("alice", {
      currentRating: 2140,
      peakRating: 2195,
      peakDate: "2026-09-18",
      currentRd: 52,
      gamesPlayed: 31,
      rank: 0,
      topWins: [],
    });
    client.setQueryData(profileQueryKeys.ratingsSnapshot("alice"), ratings);
    client.setQueryData(profileQueryKeys.monthRanks("alice"), []);
    client.setQueryData(["profile", "alice", "tournament-trophies", ["alice"]], []);
    client.setQueryData(userQueryKeys.aliasRegistration(["alice"]), null);
    loadRawMatchesByMode.mockResolvedValue({ matches: [], total: 0 });

    renderProfile({ historyOnly: false });

    const blitzRatings = await screen.findByRole("region", {
      name: "Blitz ratings",
    });
    expect(within(blitzRatings).getByText("Estimated Rating")).toBeInTheDocument();
    expect(within(blitzRatings).getByText("2140")).toBeInTheDocument();
    expect(within(blitzRatings).getByText("Estimated Peak")).toBeInTheDocument();
    expect(within(blitzRatings).getByText("2195")).toBeInTheDocument();
    expect(screen.getByText("CHEATER")).toBeInTheDocument();
    expect(screen.getByText(/Ratings shown below are estimates/)).toBeInTheDocument();
    expect(screen.queryByText("(#4)")).not.toBeInTheDocument();
  });

  it("shows a bot's estimate and BOT tag without the banned-player notice", async () => {
    client.setQueryData(aliasQueryKeys.identity("alice"), {
      username: "alice",
      aliases: [],
      openings: [],
      banned: false,
      bot: true,
      accounts: [],
    });
    const ratings = createModeRecord(() => new Map());
    ratings.bullet.set("alice", {
      currentRating: 2012,
      peakRating: 2050,
      peakDate: "2026-09-20",
      currentRd: 61,
      gamesPlayed: 18,
      rank: 0,
      topWins: [],
    });
    client.setQueryData(profileQueryKeys.ratingsSnapshot("alice"), ratings);
    client.setQueryData(profileQueryKeys.monthRanks("alice"), []);
    client.setQueryData(["profile", "alice", "tournament-trophies", ["alice"]], []);
    client.setQueryData(["puzzle-ranking-trophies"], []);
    client.setQueryData(userQueryKeys.aliasRegistration(["alice"]), null);
    loadRawMatchesByMode.mockResolvedValue({ matches: [], total: 0 });

    renderProfile({ historyOnly: false });

    expect(await screen.findByText("BOT")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Banned" })).not.toBeInTheDocument();
    const bulletRatings = screen.getByRole("region", { name: "Bullet ratings" });
    expect(within(bulletRatings).getByText("Estimated Rating")).toBeInTheDocument();
    expect(within(bulletRatings).getByText("2012")).toBeInTheDocument();
  });
});

describe("profile match pagination", () => {
  it("opens and closes match details from the row without a separate toggle button", async () => {
    loadRawMatchesByMode.mockResolvedValue({ matches: [match("m1", 100)], total: 1 });
    renderProfile();

    const opponentLink = await screen.findByText("bob (1745)");
    const matchRow = opponentLink.closest("tr");
    expect(matchRow).not.toBeNull();
    expect(matchRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /match details/i })).not.toBeInTheDocument();

    fireEvent.click(matchRow!);
    expect(matchRow).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("m1-game")).toBeInTheDocument();

    fireEvent.keyDown(matchRow!, { key: "Enter" });
    expect(matchRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("m1-game")).not.toBeInTheDocument();
  });

  it("loads all modes by default", async () => {
    loadRawMatchesByMode.mockResolvedValue({ matches: [], total: 0 });

    renderProfile();

    const modeSelect = await screen.findByRole("combobox", { name: "Match history mode" });
    expect(modeSelect).toHaveValue("all");
    expect(within(modeSelect).getByRole("option", { name: "All" })).toBeInTheDocument();
    await waitFor(() =>
      expect(loadRawMatchesByMode).toHaveBeenCalledWith(
        "all",
        expect.objectContaining({ page: 1, pageSize: 25 }),
      ),
    );
  });

  it("keeps the current rows until the next page loads, then positions the table", async () => {
    let resolvePage!: (result: { matches: ParsedMatch[]; total: number }) => void;
    loadRawMatchesByMode.mockImplementation((_mode, { page }) =>
      page === 1
        ? Promise.resolve({ matches: [match("m1", 100)], total: 75 })
        : new Promise((resolve) => {
            resolvePage = resolve;
          }),
    );
    renderProfile();
    await screen.findByText("Page 1 / 3");
    const currentRowContent = await screen.findByText("bob (1745)");
    const tableWrap = screen.getByRole("table").parentElement;
    expect(tableWrap).not.toBeNull();
    vi.spyOn(tableWrap!, "getBoundingClientRect").mockReturnValue({
      top: 600,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 600,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
    vi.mocked(window.scrollTo).mockClear();

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toHaveTextContent("");
    fireEvent.click(nextButton);
    await waitFor(() =>
      expect(loadRawMatchesByMode).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ page: 2 }),
      ),
    );
    expect(currentRowContent).toBeInTheDocument();
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await act(async () => resolvePage({ matches: [match("m2", 200)], total: 75 }));
    await screen.findByText("Page 2 / 3");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 650, left: 0, behavior: "auto" });
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
