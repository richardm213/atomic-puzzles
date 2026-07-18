import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";

import { App } from "./App/App";
import { RouteLoadingFallback } from "./components/RouteLoadingFallback/RouteLoadingFallback";
import { AuthCallbackPage } from "./pages/AuthCallback/AuthCallback";
import { HomePage } from "./pages/Home/Home";

const AnalysisPage = lazyRouteComponent(() => import("./pages/Analysis/Analysis"), "AnalysisPage");
const CommentsPage = lazyRouteComponent(() => import("./pages/Comments/Comments"), "CommentsPage");
const CommunityUsersPage = lazyRouteComponent(
  () => import("./pages/Community/CommunityUsers"),
  "CommunityUsersPage",
);
const H2HPage = lazyRouteComponent(() => import("./pages/H2H/H2H"), "H2HPage");
const MatchPage = lazyRouteComponent(() => import("./pages/Match/MatchPage"), "MatchPage");
const NotificationsPage = lazyRouteComponent(
  () => import("./pages/Notifications/Notifications"),
  "NotificationsPage",
);
const PlayerProfilePage = lazyRouteComponent(
  () => import("./pages/PlayerProfile/PlayerProfile"),
  "PlayerProfilePage",
);
const PracticePage = lazyRouteComponent(() => import("./pages/Practice/Practice"), "PracticePage");
const PuzzleDashboardPage = lazyRouteComponent(
  () => import("./pages/PuzzleDashboard/PuzzleDashboard"),
  "PuzzleDashboardPage",
);
const PuzzleVoteRankingsPage = lazyRouteComponent(
  () => import("./pages/Community/PuzzleVoteRankings"),
  "PuzzleVoteRankingsPage",
);
const PuzzleLeaderboardPage = lazyRouteComponent(
  () => import("./pages/PuzzleLeaderboard/PuzzleLeaderboard"),
  "PuzzleLeaderboardPage",
);
const PuzzleSetsPage = lazyRouteComponent(
  () => import("./pages/PuzzleSets/PuzzleSets"),
  "PuzzleSetsPage",
);
const PuzzleSolverPage = lazyRouteComponent(
  () => import("./pages/PuzzleSolver/PuzzleSolver"),
  "PuzzleSolverPage",
);
const PuzzleSubmissionPage = lazyRouteComponent(
  () => import("./pages/PuzzleSubmission/PuzzleSubmission"),
  "PuzzleSubmissionPage",
);
const PuzzleReviewPage = lazyRouteComponent(
  () => import("./pages/PuzzleSubmission/PuzzleSubmission"),
  "PuzzleReviewPage",
);
const RankingsPage = lazyRouteComponent(() => import("./pages/Rankings/Rankings"), "RankingsPage");
const RankingsMethodologyPage = lazyRouteComponent(
  () => import("./pages/Rankings/RankingsMethodology"),
  "RankingsMethodologyPage",
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
const BannedUsersPage = lazyRouteComponent(
  () => import("./pages/Users/BannedUsers"),
  "BannedUsersPage",
);
const UsersPage = lazyRouteComponent(() => import("./pages/Users/Users"), "UsersPage");

const appBasePath = (() => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
})();

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const rankingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rankings",
  component: RankingsPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
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

const practiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/practice",
  component: PracticePage,
});

const tournamentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tournaments",
  component: TournamentsPage,
});

const tournamentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tournaments/$tournamentId",
  component: function TournamentRoute() {
    const { tournamentId } = useParams({ strict: false });
    return <TournamentPage tournamentId={tournamentId} />;
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
  path: "/matches/$mode/$matchId",
  component: MatchPage,
});

const solveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve",
  component: PuzzleSolverPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: PuzzleDashboardPage,
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
  component: PuzzleSetsPage,
});

const puzzleLeaderboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/leaderboard",
  component: PuzzleLeaderboardPage,
});

const puzzleSubmissionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/submit",
  component: PuzzleSubmissionPage,
});

const puzzleReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/puzzles/review",
  component: PuzzleReviewPage,
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: NotificationsPage,
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
  component: CommunityUsersPage,
});

const profilePuzzleDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username/puzzles",
  component: function ProfilePuzzleDashboardRoute() {
    const { username } = useParams({ strict: false });
    return <PuzzleDashboardPage username={username} />;
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
  component: PuzzleSolverPage,
});

const solveSetWithIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/set/$setKey/$puzzleId",
  component: PuzzleSolverPage,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/@/$username",
  component: function ProfileRoute() {
    const { username } = useParams({ strict: false });
    return <PlayerProfilePage username={username} />;
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
  rankingsRoute,
  usersRoute,
  bannedUsersRoute,
  rankingsMethodologyRoute,
  analysisRoute,
  practiceRoute,
  recentRoute,
  tournamentsRoute,
  tournamentRoute,
  h2hRoute,
  h2hMatchupRoute,
  matchRoute,
  matchesAliasRoute,
  solveRoute,
  dashboardRoute,
  legacyPuzzleHistoryRoute,
  solveSetsRoute,
  puzzleLeaderboardRoute,
  puzzleSubmissionRoute,
  puzzleReviewRoute,
  notificationsRoute,
  commentsRoute,
  communityRoute,
  communityPuzzlesRoute,
  communityUsersRoute,
  solveSetWithIdRoute,
  solveWithIdRoute,
  profileHistoryRoute,
  profileRoute,
  profilePuzzleDashboardRoute,
  profilePuzzleContributionsRoute,
  lichessAuthCallbackRoute,
]);

const router = createRouter({
  routeTree,
  basepath: appBasePath,
  defaultPendingComponent: RouteLoadingFallback,
  defaultPreload: "intent",
});

export const AppRouterProvider = () => <RouterProvider router={router} />;
