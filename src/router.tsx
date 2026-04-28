import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { App } from "./App/App";
import { HomePage } from "./pages/Home/Home";
import { RankingsPage } from "./pages/Rankings/Rankings";
import { RankingsMethodologyPage } from "./pages/Rankings/RankingsMethodology";
import { RecentMatchesPage } from "./pages/RecentMatches/RecentMatches";
import { PlayerProfilePage } from "./pages/PlayerProfile/PlayerProfile";
import { PuzzleDashboardPage } from "./pages/PuzzleDashboard/PuzzleDashboard";
import { PuzzleSolverPage } from "./pages/PuzzleSolver/PuzzleSolver";
import { PuzzleSetsPage } from "./pages/PuzzleSets/PuzzleSets";
import { H2HPage } from "./pages/H2H/H2H";
import { MatchPage } from "./pages/Match/MatchPage";
import { AuthCallbackPage } from "./pages/AuthCallback/AuthCallback";
import { UsersPage } from "./pages/Users/Users";
import { BannedUsersPage } from "./pages/Users/BannedUsers";
import { TournamentsPage } from "./pages/Tournaments/Tournaments";
import { TournamentPage } from "./pages/Tournament/TournamentPage";

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
  component: function HiddenProfilePuzzleContributionsRoute() {
    const { username } = useParams({ strict: false });
    return <PlayerProfilePage username={username} />;
  },
});

const solveWithIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/solve/$puzzleId",
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
  solveWithIdRoute,
  profileRoute,
  profilePuzzleDashboardRoute,
  profilePuzzleContributionsRoute,
  lichessAuthCallbackRoute,
]);

const router = createRouter({
  routeTree,
  basepath: appBasePath,
});

export const AppRouterProvider = () => <RouterProvider router={router} />;
