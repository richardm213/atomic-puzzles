import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  redirect,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import type { ComponentType } from "react";

import { App } from "./App/App";
import { RequireAuthentication } from "./components/RequireAuthentication/RequireAuthentication";
import {
  RouteErrorFallback,
  RouteNotFoundFallback,
} from "./components/RouteFallback/RouteFallback";
import { RouteLoadingFallback } from "./components/RouteLoadingFallback/RouteLoadingFallback";
import { queryClient } from "./lib/query/queryClient";
import { AuthCallbackPage } from "./pages/AuthCallback/AuthCallback";
import { HomePage } from "./pages/Home/Home";

const AtomicChessPage = lazyRouteComponent(
  () => import("./pages/AtomicChess/AtomicChess"),
  "AtomicChessPage",
);
const AtomicOpeningsPage = lazyRouteComponent(
  () => import("./pages/AtomicOpenings/AtomicOpenings"),
  "AtomicOpeningsPage",
);
const ArenasPage = lazyRouteComponent(() => import("./pages/Arenas/Arenas"), "ArenasPage");
const CalendarPage = lazyRouteComponent(() => import("./pages/Calendar/Calendar"), "CalendarPage");
const BettingPage = lazyRouteComponent(() => import("./pages/Betting/Betting"), "BettingPage");
const PredictionMarketPage = lazyRouteComponent(
  () => import("./pages/PredictionMarket/PredictionMarket"),
  "PredictionMarketPage",
);
const AnalysisPage = lazyRouteComponent(() => import("./pages/Analysis/Analysis"), "AnalysisPage");
const GamePage = lazyRouteComponent(() => import("./pages/Game/GamePage"), "GamePage");
const AchievementsPage = lazyRouteComponent(
  () => import("./pages/Achievements/Achievements"),
  "AchievementsPage",
);
const CommentsPage = lazyRouteComponent(() => import("./pages/Comments/Comments"), "CommentsPage");
const CommunityUsersPage = lazyRouteComponent(
  () => import("./pages/Community/CommunityUsers"),
  "CommunityUsersPage",
);
const H2HPage = lazyRouteComponent(() => import("./pages/H2H/H2H"), "H2HPage");
const MatchPage = lazyRouteComponent(() => import("./pages/Match/MatchPage"), "MatchPage");
const ScheduledMatchPage = lazyRouteComponent(
  () => import("./pages/Match/ScheduledMatchPage"),
  "ScheduledMatchPage",
);
const NotificationsPage = lazyRouteComponent(
  () => import("./pages/Notifications/Notifications"),
  "NotificationsPage",
);
const ShopPage = lazyRouteComponent(() => import("./pages/Shop/Shop"), "ShopPage");
const PlayerProfilePage = lazyRouteComponent(
  () => import("./pages/PlayerProfile/PlayerProfile"),
  "PlayerProfilePage",
);
const RatingHistoryPage = lazyRouteComponent(
  () => import("./pages/PlayerProfile/RatingHistoryPage"),
  "RatingHistoryPage",
);
const PracticePage = lazyRouteComponent(() => import("./pages/Practice/Practice"), "PracticePage");
const EndgamePracticePage = lazyRouteComponent(
  () => import("./pages/EndgamePractice/EndgamePractice"),
  "EndgamePracticePage",
);
const PuzzleDashboardPage = lazyRouteComponent(
  () => import("./pages/PuzzleDashboard/PuzzleDashboard"),
  "PuzzleDashboardPage",
);
const CustomPuzzleSetsPage = lazyRouteComponent(
  () => import("./pages/CustomPuzzleSets/CustomPuzzleSets"),
  "CustomPuzzleSetsPage",
);
const CustomPuzzleSetEditPage = lazyRouteComponent(
  () => import("./pages/CustomPuzzleSets/CustomPuzzleSetEdit"),
  "CustomPuzzleSetEditPage",
);
const PuzzleVoteRankingsPage = lazyRouteComponent(
  () => import("./pages/Community/PuzzleVoteRankings"),
  "PuzzleVoteRankingsPage",
);
const PuzzleLeaderboardPage = lazyRouteComponent(
  () => import("./pages/PuzzleLeaderboard/PuzzleLeaderboard"),
  "PuzzleLeaderboardPage",
);
const CoinRankingsPage = lazyRouteComponent(
  () => import("./pages/CoinRankings/CoinRankings"),
  "CoinRankingsPage",
);
const CoinEconomyBansPage = lazyRouteComponent(
  () => import("./pages/CoinEconomyBans/CoinEconomyBans"),
  "CoinEconomyBansPage",
);
const ShopRedemptionsPage = lazyRouteComponent(
  () => import("./pages/ShopRedemptions/ShopRedemptions"),
  "ShopRedemptionsPage",
);
const GameAnalysesPage = lazyRouteComponent(
  () => import("./pages/GameAnalyses/GameAnalyses"),
  "GameAnalysesPage",
);
const GameAnalysesFinishedPage = lazyRouteComponent(
  () => import("./pages/GameAnalyses/GameAnalysesFinished"),
  "GameAnalysesFinishedPage",
);
const PuzzleMotifsPage = lazyRouteComponent(
  () => import("./pages/PuzzleMotifs/PuzzleMotifs"),
  "PuzzleMotifsPage",
);
const PuzzleSetsPage = lazyRouteComponent(
  () => import("./pages/PuzzleSets/PuzzleSets"),
  "PuzzleSetsPage",
);
const PuzzleSolverPage = lazyRouteComponent(
  () => import("./pages/PuzzleSolver/PuzzleSolver"),
  "PuzzleSolverPage",
);
const GuestPuzzleTrial = lazyRouteComponent(
  () => import("./pages/PuzzleSolver/GuestPuzzleTrial"),
  "GuestPuzzleTrial",
);
const PuzzleSubmissionPage = lazyRouteComponent(
  () => import("./pages/PuzzleSubmission/PuzzleSubmission"),
  "PuzzleSubmissionPage",
);
const PuzzleReviewPage = lazyRouteComponent(
  () => import("./pages/PuzzleReview/PuzzleReview"),
  "PuzzleReviewPage",
);
const PuzzleRecentPage = lazyRouteComponent(
  () => import("./pages/PuzzleRecent/PuzzleRecent"),
  "PuzzleRecentPage",
);
const PuzzleIssuesPage = lazyRouteComponent(
  () => import("./pages/PuzzleIssues/PuzzleIssues"),
  "PuzzleIssuesPage",
);
const HowCoinsWorkPage = lazyRouteComponent(
  () => import("./pages/Shop/HowCoinsWork"),
  "HowCoinsWorkPage",
);
const RankingsPage = lazyRouteComponent(() => import("./pages/Rankings/Rankings"), "RankingsPage");
const YearlyRankingsPage = lazyRouteComponent(
  () => import("./pages/Rankings/Rankings"),
  "YearlyRankingsPage",
);
const RankingsMethodologyPage = lazyRouteComponent(
  () => import("./pages/Rankings/RankingsMethodology"),
  "RankingsMethodologyPage",
);
const OpeningRankingsPage = lazyRouteComponent(
  () => import("./pages/OpeningRankings/OpeningRankings"),
  "OpeningRankingsPage",
);
const AtomicTourRankingsPage = lazyRouteComponent(
  () => import("./pages/AtomicTourRankings/AtomicTourRankings"),
  "AtomicTourRankingsPage",
);
const AtomicTourPointsPage = lazyRouteComponent(
  () => import("./pages/AtomicTourPoints/AtomicTourPoints"),
  "AtomicTourPointsPage",
);
const RecentMatchesPage = lazyRouteComponent(
  () => import("./pages/RecentMatches/RecentMatches"),
  "RecentMatchesPage",
);
const TournamentPage = lazyRouteComponent(
  () => import("./pages/Tournament/TournamentPage"),
  "TournamentPage",
);
const TournamentsPage = lazyRouteComponent(
  () => import("./pages/Tournaments/Tournaments"),
  "TournamentsPage",
);
const TournamentPlayerPage = lazyRouteComponent(
  () => import("./pages/TournamentPlayer/TournamentPlayer"),
  "TournamentPlayerPage",
);
const BannedUsersPage = lazyRouteComponent(
  () => import("./pages/Users/BannedUsers"),
  "BannedUsersPage",
);
const UsersPage = lazyRouteComponent(() => import("./pages/Users/Users"), "UsersPage");

const requirePuzzleLogin = (Page: ComponentType) => {
  const AuthenticatedPuzzlePage = () => (
    <RequireAuthentication>
      <Page />
    </RequireAuthentication>
  );
  AuthenticatedPuzzlePage.displayName = `AuthenticatedPuzzlePage(${Page.displayName || Page.name || "Page"})`;
  return AuthenticatedPuzzlePage;
};

const AuthenticatedPuzzleDashboardPage = requirePuzzleLogin(PuzzleDashboardPage);
const AuthenticatedCustomPuzzleSetsPage = requirePuzzleLogin(CustomPuzzleSetsPage);
const AuthenticatedCustomPuzzleSetEditPage = requirePuzzleLogin(CustomPuzzleSetEditPage);
const AuthenticatedPuzzleSetsPage = requirePuzzleLogin(PuzzleSetsPage);
const AuthenticatedPuzzleSolverPage = requirePuzzleLogin(PuzzleSolverPage);
const AuthenticatedPuzzleSubmissionPage = requirePuzzleLogin(PuzzleSubmissionPage);
const AuthenticatedPuzzleReviewPage = requirePuzzleLogin(PuzzleReviewPage);
const AuthenticatedPuzzleRecentPage = requirePuzzleLogin(PuzzleRecentPage);
const AuthenticatedPuzzleIssuesPage = requirePuzzleLogin(PuzzleIssuesPage);

const appBasePath = (() => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
})();

type AppRouterContext = {
  queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const atomicChessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/atomic-chess",
  component: AtomicChessPage,
});

const atomicOpeningsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/atomic-chess/openings",
  component: AtomicOpeningsPage,
});

const rankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings",
  loader: ({ context }) => {
    const currentMonth = new Date().toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    void Promise.all([
      import("./lib/rankings/rankingsQueries").then(({ rankingsForMonthQueryOptions }) =>
        context.queryClient.prefetchQuery(rankingsForMonthQueryOptions(currentMonth)),
      ),
      import("./lib/users/aliasQueries").then(({ aliasesLookupQueryOptions }) =>
        context.queryClient.prefetchQuery(aliasesLookupQueryOptions()),
      ),
    ]);
  },
  component: RankingsPage,
});

const yearlyRankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings/yearly",
  loader: ({ context }) => {
    void import("./lib/rankings/rankingsQueries").then(({ rankingsForYearQueryOptions }) =>
      context.queryClient.prefetchQuery(rankingsForYearQueryOptions(new Date().getUTCFullYear())),
    );
  },
  component: YearlyRankingsPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  loader: ({ context }) => {
    void Promise.all([
      import("./lib/users/userQueries").then(({ userRatingsQueryOptions }) =>
        context.queryClient.prefetchQuery(userRatingsQueryOptions()),
      ),
      import("./lib/users/aliasQueries").then(({ aliasesLookupQueryOptions }) =>
        context.queryClient.prefetchQuery(aliasesLookupQueryOptions()),
      ),
    ]);
  },
  component: UsersPage,
});

const bannedUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/banned",
  component: BannedUsersPage,
});

const rankingsMethodologyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings/how-ratings-work",
  component: RankingsMethodologyPage,
});

const openingRankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings/openings",
  component: OpeningRankingsPage,
});

const atomicTourRankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings/tour",
  component: AtomicTourRankingsPage,
});

const atomicTourPointsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings/tour/points",
  component: AtomicTourPointsPage,
});

const recentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recent",
  component: RecentMatchesPage,
});

const analysisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analysis",
  component: AnalysisPage,
});

const analysisFenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analysis/$",
  component: AnalysisPage,
});

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$gameId",
  loader: ({ context, params }) => {
    void import("./lib/games/queries").then(({ gameDetailQueryOptions }) =>
      context.queryClient.prefetchQuery(gameDetailQueryOptions(params.gameId)),
    );
  },
  component: GamePage,
});

const legacyGameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$gameId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/game/$gameId", params: { gameId: params.gameId } });
  },
});

const practiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/practice/{-$opponents}",
  component: PracticePage,
});

const endgamePracticeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/endgames",
  component: EndgamePracticePage,
});

const arenasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/arenas",
  loader: ({ context }) => {
    void import("./lib/supabase/arenas").then(({ arenasQueryOptions }) =>
      context.queryClient.prefetchQuery(arenasQueryOptions()),
    );
  },
  component: ArenasPage,
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/calendar",
  component: CalendarPage,
});

const bettingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting",
  component: BettingPage,
});

const predictionMarketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting/ban-2026",
  component: PredictionMarketPage,
});

const atomicShieldPredictionMarketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting/november-atomic-shield-2026",
  component: PredictionMarketPage,
});

const awcChampionPredictionMarketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting/awc-2026-champion",
  component: PredictionMarketPage,
});

const awc2027ChampionPredictionMarketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting/awc-2027-champion",
  component: PredictionMarketPage,
});

const awcLosersRound1PredictionMarketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting/awc-2026-losers-round-1",
  component: PredictionMarketPage,
});

const awcQuarterfinalsPredictionMarketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting/awc-2026-quarterfinals",
  component: PredictionMarketPage,
});

const awcRoundOf16PredictionMarketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/betting/awc-2026-round-of-16",
  component: PredictionMarketPage,
});

const tournamentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tournaments",
  loader: ({ context }) => {
    void import("./lib/matches/tournamentQueries").then(
      ({ tournamentCatalogQueryOptions, tournamentChampionsQueryOptions }) =>
        Promise.all([
          context.queryClient.prefetchQuery(tournamentCatalogQueryOptions()),
          context.queryClient.prefetchQuery(tournamentChampionsQueryOptions()),
        ]),
    );
  },
  component: TournamentsPage,
});

const tournamentPlayerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tournaments/players/$username",
  component: function TournamentPlayerRoute() {
    const { username } = useParams({ strict: false });
    return <TournamentPlayerPage username={username} />;
  },
});

const validateTournamentSearch = (search: Record<string, unknown>) => ({
  round:
    typeof search.round === "string" ? search.round.trim().toLowerCase() || undefined : undefined,
});

const tournamentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tournaments/$tournamentId",
  validateSearch: validateTournamentSearch,
  loader: ({ context, params }) => {
    void import("./lib/matches/tournamentQueries").then(({ tournamentBracketQueryOptions }) =>
      context.queryClient.prefetchQuery(tournamentBracketQueryOptions(params.tournamentId)),
    );
  },
  component: function TournamentRoute() {
    const { tournamentId } = useParams({ strict: false });
    const { round } = tournamentRoute.useSearch();
    return <TournamentPage tournamentId={tournamentId} tournamentRound={round} />;
  },
});

const tournamentTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tournaments/$tournamentId/$tournamentTab",
  validateSearch: validateTournamentSearch,
  loader: ({ context, params }) => {
    void import("./lib/matches/tournamentQueries").then(({ tournamentBracketQueryOptions }) =>
      context.queryClient.prefetchQuery(tournamentBracketQueryOptions(params.tournamentId)),
    );
  },
  component: function TournamentTabRoute() {
    const { tournamentId, tournamentTab } = useParams({ strict: false });
    const { round } = tournamentTabRoute.useSearch();
    return (
      <TournamentPage
        tournamentId={tournamentId}
        tournamentTab={tournamentTab}
        tournamentRound={round}
      />
    );
  },
});

const h2hRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/h2h",
  component: H2HPage,
});

const h2hMatchupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/h2h/$matchup",
  loader: ({ context, params }) => {
    void Promise.all([import("./lib/matches/h2hRoutes"), import("./lib/matches/queries")]).then(
      ([{ parseMatchupSlug }, { h2hMatchupQueryOptions }]) => {
        const matchup = parseMatchupSlug(params.matchup);
        if (!matchup) return;
        return context.queryClient.prefetchQuery(
          h2hMatchupQueryOptions(matchup.player1, matchup.player2),
        );
      },
    );
  },
  component: H2HPage,
});

const matchesAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/matches",
  beforeLoad: () => {
    throw redirect({ to: "/recent" });
  },
});

const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/match/$matchId",
  loader: ({ context, params }) => {
    void import("./lib/matches/queries").then(({ matchDetailQueryOptions }) =>
      context.queryClient.prefetchQuery(matchDetailQueryOptions(params.matchId)),
    );
  },
  component: MatchPage,
});

const scheduledMatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/match/scheduled/$tournamentId/$fixtureId",
  component: ScheduledMatchPage,
});

const legacyMatchDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/matches/$matchId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/match/$matchId", params: { matchId: params.matchId } });
  },
});

const legacyMatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/matches/$mode/$matchId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/match/$matchId", params: { matchId: params.matchId } });
  },
});

const solveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve",
  component: function SolveRoute() {
    return (
      <RequireAuthentication signedOutFallback={<GuestPuzzleTrial />}>
        <PuzzleSolverPage />
      </RequireAuthentication>
    );
  },
});

const solveGuestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/guest/$guestNumber",
  component: function SolveGuestRoute() {
    const { guestNumber } = solveGuestRoute.useParams();
    return (
      <RequireAuthentication
        signedOutFallback={<GuestPuzzleTrial key={guestNumber} guestNumber={guestNumber} />}
      >
        <Navigate to="/solve" replace />
      </RequireAuthentication>
    );
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: AuthenticatedPuzzleDashboardPage,
});

const legacyPuzzleHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/history",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

const solveSetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/sets",
  validateSearch: (search: Record<string, unknown>) => ({
    filter: typeof search.filter === "string" ? search.filter : undefined,
  }),
  component: AuthenticatedPuzzleSetsPage,
});

const customPuzzleSetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/custom-sets",
  component: AuthenticatedCustomPuzzleSetsPage,
});

const customPuzzleSetEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/custom-sets/$setId/edit",
  component: AuthenticatedCustomPuzzleSetEditPage,
});

const puzzleLeaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings/puzzles",
  loader: ({ context }) => {
    void import("./lib/puzzles/puzzleQueries").then(({ puzzleLeaderboardQueryOptions }) =>
      context.queryClient.prefetchQuery(
        puzzleLeaderboardQueryOptions("monthly", new Date().toISOString().slice(0, 7)),
      ),
    );
  },
  component: PuzzleLeaderboardPage,
});

const coinRankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings/coins",
  loader: ({ context }) => {
    void import("./lib/coins/coinQueries").then(({ coinRankingsQueryOptions }) =>
      context.queryClient.prefetchQuery(coinRankingsQueryOptions()),
    );
  },
  component: CoinRankingsPage,
});

const coinEconomyBansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/coin-bans",
  component: CoinEconomyBansPage,
});

const shopRedemptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/shop-redemptions",
  component: ShopRedemptionsPage,
});

const gameAnalysesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/game-analyses",
  validateSearch: (search: Record<string, unknown>) => ({
    page:
      typeof search.page === "number" && Number.isInteger(search.page) && search.page > 1
        ? search.page
        : undefined,
  }),
  component: GameAnalysesPage,
});

const gameAnalysesFinishedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/game-analyses/finished",
  validateSearch: (search: Record<string, unknown>) => ({
    page:
      typeof search.page === "number" && Number.isInteger(search.page) && search.page > 1
        ? search.page
        : undefined,
  }),
  component: GameAnalysesFinishedPage,
});

const legacyPuzzleLeaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/leaderboard",
  beforeLoad: () => {
    throw redirect({ to: "/rankings/puzzles" });
  },
});

const puzzleMotifsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tactical-motifs",
  component: PuzzleMotifsPage,
});

const legacyPuzzleMotifsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/motifs",
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/tactical-motifs",
      search: location.search,
      hash: location.hash,
      replace: true,
    });
  },
});

const puzzleSubmissionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/submit",
  component: AuthenticatedPuzzleSubmissionPage,
});

const puzzleReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/review",
  component: AuthenticatedPuzzleReviewPage,
});

const puzzleRecentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/recent",
  component: AuthenticatedPuzzleRecentPage,
});

const puzzleIssuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/issues",
  component: AuthenticatedPuzzleIssuesPage,
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: NotificationsPage,
});

const shopRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shop",
  component: ShopPage,
});

const howCoinsWorkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shop/how-coins-work",
  component: HowCoinsWorkPage,
});

const achievementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/achievements",
  component: AchievementsPage,
});

const commentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comments",
  component: CommentsPage,
});

const communityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/community",
  beforeLoad: () => {
    throw redirect({ to: "/community/puzzles" });
  },
});

const communityPuzzlesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/community/puzzles",
  component: PuzzleVoteRankingsPage,
});

const communityUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/community/users",
  loader: ({ context }) => {
    void import("./lib/community/communityQueries").then(({ communityUsersQueryOptions }) =>
      context.queryClient.prefetchQuery(communityUsersQueryOptions()),
    );
  },
  component: CommunityUsersPage,
});

const profilePuzzleDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username/puzzles",
  component: function ProfilePuzzleDashboardRoute() {
    const { username } = useParams({ strict: false });
    return (
      <RequireAuthentication>
        <PuzzleDashboardPage username={username} />
      </RequireAuthentication>
    );
  },
});

const profilePuzzleContributionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username/contributions",
  beforeLoad: ({ params }) => {
    const username = typeof params?.username === "string" ? params.username : "";
    throw redirect({ to: "/@/$username", params: { username } });
  },
});

const solveWithIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/$puzzleId",
  component: AuthenticatedPuzzleSolverPage,
});

const solveSetWithIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/set/$setKey/$puzzleId",
  component: AuthenticatedPuzzleSolverPage,
});

const solveCustomSetWithIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/custom/$setId/$puzzleId",
  component: AuthenticatedPuzzleSolverPage,
});

const solveDashboardSetWithIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/dashboard/$dashboardSetId/$puzzleId",
  component: AuthenticatedPuzzleSolverPage,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username",
  component: function ProfileRoute() {
    const { username } = useParams({ strict: false });
    return <PlayerProfilePage username={username} />;
  },
});

const profileRatingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username/ratings",
  component: function ProfileRatingsRoute() {
    const { username } = useParams({ strict: false });
    return <RatingHistoryPage username={username ?? ""} />;
  },
});

const profileAchievementsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username/achievements",
  component: function ProfileAchievementsRoute() {
    const { username } = useParams({ strict: false });
    return <AchievementsPage username={username} />;
  },
});

const profileHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username/history",
  component: function ProfileHistoryRoute() {
    const { username } = useParams({ strict: false });
    return <PlayerProfilePage username={username} historyOnly />;
  },
});

const lichessAuthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/lichess/callback",
  component: AuthCallbackPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  atomicChessRoute,
  atomicOpeningsRoute,
  rankingsRoute,
  yearlyRankingsRoute,
  usersRoute,
  bannedUsersRoute,
  rankingsMethodologyRoute,
  openingRankingsRoute,
  atomicTourRankingsRoute,
  atomicTourPointsRoute,
  analysisRoute,
  analysisFenRoute,
  gameRoute,
  legacyGameRoute,
  practiceRoute,
  endgamePracticeRoute,
  recentRoute,
  tournamentsRoute,
  tournamentPlayerRoute,
  arenasRoute,
  calendarRoute,
  bettingRoute,
  predictionMarketRoute,
  atomicShieldPredictionMarketRoute,
  awcChampionPredictionMarketRoute,
  awc2027ChampionPredictionMarketRoute,
  awcQuarterfinalsPredictionMarketRoute,
  awcLosersRound1PredictionMarketRoute,
  awcRoundOf16PredictionMarketRoute,
  tournamentRoute,
  tournamentTabRoute,
  h2hRoute,
  h2hMatchupRoute,
  matchRoute,
  scheduledMatchRoute,
  legacyMatchDetailRoute,
  legacyMatchRoute,
  matchesAliasRoute,
  solveRoute,
  solveGuestRoute,
  dashboardRoute,
  legacyPuzzleHistoryRoute,
  solveSetsRoute,
  customPuzzleSetsRoute,
  customPuzzleSetEditRoute,
  puzzleLeaderboardRoute,
  coinRankingsRoute,
  coinEconomyBansRoute,
  shopRedemptionsRoute,
  gameAnalysesRoute,
  gameAnalysesFinishedRoute,
  legacyPuzzleLeaderboardRoute,
  puzzleMotifsRoute,
  legacyPuzzleMotifsRoute,
  puzzleSubmissionRoute,
  puzzleReviewRoute,
  puzzleRecentRoute,
  puzzleIssuesRoute,
  notificationsRoute,
  shopRoute,
  howCoinsWorkRoute,
  achievementsRoute,
  commentsRoute,
  communityRoute,
  communityPuzzlesRoute,
  communityUsersRoute,
  solveSetWithIdRoute,
  solveCustomSetWithIdRoute,
  solveDashboardSetWithIdRoute,
  solveWithIdRoute,
  profileRatingsRoute,
  profileAchievementsRoute,
  profileHistoryRoute,
  profileRoute,
  profilePuzzleDashboardRoute,
  profilePuzzleContributionsRoute,
  lichessAuthCallbackRoute,
]);

const router = createRouter({
  routeTree,
  basepath: appBasePath,
  context: { queryClient },
  defaultPendingComponent: RouteLoadingFallback,
  defaultErrorComponent: RouteErrorFallback,
  defaultNotFoundComponent: RouteNotFoundFallback,
  defaultPreload: "intent",
  scrollRestoration: true,
  getScrollRestorationKey: (location) => location.pathname,
});

export const AppRouterProvider = () => (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
